# はじめに

普段は`docker compose up`で開発している私ですが、「HerokuのようなPaaSの裏側ってどうなっているのだろう？」という興味から、ローカルに自分専用のPaaSを構築してみることにしました。選んだのは、OrbStack(個人利用)のLinux仮想マシン機能と、モダンなUIを持つOSSのPaaSのDokployです。
「GUIでポチポチすれば動くだろう」と高をくくっていましたが、実際にはDocker Composeとは全く異なる「運用」の壁に次々と激突しました。この記事は、そのトラブルシュートの記録です。

https://orbstack.dev/

https://dokploy.com/

# 構成

検証目的で以下のような入れ子構造を作りました。

![image.png](https://qiita-image-store.s3.ap-northeast-1.amazonaws.com/0/3618319/bef2f0c8-ca5f-4485-aaad-81e6147b7a67.png)


:::note warn
本来DokployはVPS等で使うものです。
この構成はあくまで「ローカルでPaaSの挙動を学ぶため」の実験環境です。
:::

# アプリケーション(Vibe Coding)

https://github.com/rxmrsd/sample-app

- Frontend: React + Vite
- Backend: Go (gorilla/mux)
- Database: PostgreSQL

# Dokployにホスティング

## 「Create Service」-> 「Compose」

![image.png](https://qiita-image-store.s3.ap-northeast-1.amazonaws.com/0/3618319/e4fb421e-e4ee-4a80-bc6b-fd9856f9ca2c.png)

## git連携
今回はローカル環境なので、連携は「Git」とPersonal Access Tokenで実施
Repository URLとbranchとcomposeを適宜設定し、「🚀Deploy」

![image.png](https://qiita-image-store.s3.ap-northeast-1.amazonaws.com/0/3618319/bf07c35b-4709-4c16-ad5d-6a681786ca4f.png)

# 5つの壁と解決策

Docker Composeなら一瞬で動く構成でも、Dokployに乗せると多くの修正が必要でした。
以下、私がぶつかった5つの壁です。

## 1. フロントエンドが表示されない（Vite vs Nginx）

■問題
ローカル開発では`docker compose up`で快適に動いていたReactアプリが、デプロイすると`404`や接続拒否になります。

■原因
- Viteの開発サーバーは WebSocket(HMR)を使用
- Dokployの自動設定リバースプロキシ（Traefik）経由だと疎通できない

■解決策

本番相当のアーキテクチャ（ビルド成果物の配信）に準拠させ、ビルドしてNginxで静的配信するDockerfileに書き換えました

```Dockerfile
# Build stage
FROM node:20-alpine AS builder
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

SPA 用に nginx.conf を設定し、Traefik から単なる Web サーバーとして扱えるようにしました。

## 2. ポート競合エラー（Bind failed）

■問題

`Error: Bind for 0.0.0.0:80 failed: port is already allocated`

■原因

- Docker Composeでは`ports: - "80:80"`が OK
- DokployではTraefikがホストの`80/443`を専有するため競合する
- リバースプロキシ（Traefik）がすべてのトラフィックの入り口（Ingress）となるため、個別のコンテナがホストの80番をListenすることはできない

■解決策

`compose.prod.yaml`では`ports`を削除し、`expose`に変更

```Dockerfile
frontend:
  # ports:      <-- 削除
  expose:       <-- コンテナ間通信のみ許可
    - "80"
```

## 3. VITE_API_URLが反映されない

■問題

Dokploy GUI で環境変数を設定しても、フロントエンドから API が空になったまま

■原因

- Vite の環境変数（VITE_***）は ビルド時に埋め込まれる
- ランタイムでDokployから渡しても手遅れ

■解決策

`compose.prod.yaml`の`args`に値を渡してビルド時に反映

```Dockerfile
frontend:
  build:
    context: ./frontend
    args:
      VITE_API_URL: http://api.sample.192.168.139.100.traefik.me
```

## 4. バックエンドがDBを見つけられない(ここがポイントだったかも)

■問題

`dial tcp: lookup db on 127.0.0.11:53: no such host`

■原因

- Dokploy はサービスごとにネットワークを分離することがある
- サービス名での名前解決が失敗

■解決策

「Enable Isolated Deployment」を有効にし、サービス群を同一ネットワークに配置


![image.png](https://qiita-image-store.s3.ap-northeast-1.amazonaws.com/0/3618319/74e701a2-dc92-4b94-86c0-26101bb883be.png)

:::note 
<details><summary>Isolated Deploymentとは </summary>

Dokployでは、Composeファイルをデプロイする際に2つのモードがあります。  
  | モード | 動作 | ユースケース |                                       
  |--------|------|--------------|                                       
  | 通常モード | 各サービスがDokployの共有ネットワークに参加 | 複数プロジェクト間でサービスを共有したい場合 |                         
  | Isolated Deployment | Compose内のサービスだけで独立したネットワークを構成 | 1つのComposeで完結するアプリケーション |                               

通常モードでは、Dokployが管理する共有ネットワーク（`dokploy-network`） にサービスが参加します。しかし、この場合Composeファイル内で定義したサービス名（`db`など）での名前解決がうまくいかないことがあります。
Isolated Deploymentを有効にすると、そのCompose専用のDockerネットワークが作成され、`db`、`backend`、`frontend`といったサービス名でお互いに通信できるようになります。

 ##### 設定方法                                                         
Dokploy管理画面で以下の手順で設定します：                              
1. プロジェクト → 対象のComposeを選択                                  
2. **Advanced**タブを開く                                               
3. **Enable Isolated Deployment**のトグルを有効にする                         
4. **Redeploy**を実行

 ##### ネットワーク構成の違い                                           

**通常モード（Isolated Deployment: OFF）**                             
dokploy-network（共有）                                                
├── 他のプロジェクトのサービス                                         
├── frontend  ← サービス名での通信が不安定                             
├── backend                                                            
└── db                                                                 

**Isolated Deployment: ON**                                            
compose名-network（専用）                                            
├── frontend  ← サービス名で確実に通信可能                             
├── backend                                                            
└── db

</details>
:::

## 5. CORSエラーと「ドメインの壁」

■問題

- APIにアクセスするとCORSエラー
- localhostではルーティングもうまくいかない

■原因

- PaaS 環境ではフロント/バックが別サブドメインを持つことが多い
- 適切な CORS 設定とドメイン解決が必要

■解決策

`traefik.me`を利用し、ローカルでも本番と同じドメイン構成を再現

```Go
allowedOrigins := os.Getenv("ALLOWED_ORIGINS")
c := cors.New(cors.Options{
    AllowedOrigins: []string{allowedOrigins},
})
```

:::note
<details> <summary>traefik.meとは</summary>

**traefik.me**は、IPアドレスを含むドメイン名をそのIPアドレスに解決してくれる無料のワイルドカードDNSサービスです。                                                
                                                                                   
通常、独自ドメインでアプリにアクセスするには：                                   
1. ドメインを取得する                                                            
2. DNSレコードを設定する                                                         
3. （本番環境では）SSL証明書を取得する                                           
                                                                                   
という手順が必要ですが、traefik.meを使えば**DNSの設定なしで**すぐにドメイン形式のURLでアクセスできます。                                                          
                                                                                   
### 仕組み                                                                       
                                                                                   
traefik.meは以下のルールでDNS解決を行います：                                    
                                                                                   
*.IPアドレス.traefik.me → そのIPアドレスに解決                                 
                                                                                   
| ドメイン | 解決先IP |                                                          
|----------|----------|                                                          
| `my-app.192.168.139.100.traefik.me` | 192.168.139.100 |                         
| `api.192.168.139.100.traefik.me` | 192.168.139.100 |                           
| `anything.10.0.0.1.traefik.me` | 10.0.0.1 |                                    
                                                                                   
`*`の部分には任意の文字列を入れられるため、同じIPで複数のサービスを異なるドメインで公開できます。                                                                 
                                                                                   
### 今回の構成での使用例                                                         
                                                                                   
DokployサーバーのIP: `192.168.139.100`                                           
                                                                                   
| サービス | ドメイン設定 |                                                      
|----------|--------------|                                                      
| フロントエンド | `my-app.192.168.139.100.traefik.me` |                         
| バックエンドAPI | `api.sample.192.168.139.100.traefik.me` |                    
                                                                                   
Dokployの各サービスのドメイン設定（Domainsタブ）に上記を入力するだけで、Traefikが自動的にルーティングしてくれます。        
                                                                                   
### 注意点                                                                       
                                                                                   
- **プライベートIP限定**: `192.168.x.x`などのプライベートIPを使う場合、同じネットワーク内のマシンからしかアクセスできません                                       
- **HTTPのみ**: traefik.meはHTTPでの利用が基本です（HTTPSも可能ですが、証明書の警告が出ます）    
- **本番環境には不向き**: あくまで開発・検証用途です     

</details>

:::

# 結果

上記の対応をして、ようやくアプリケーションが開けました。(ただのTODOアプリ)

`http://my-app.192.168.139.100.traefik.me/`

![image.png](https://qiita-image-store.s3.ap-northeast-1.amazonaws.com/0/3618319/d135feae-4c3d-421a-8bb5-19b584f34c27.png)

# まとめ

## Dokployは日々の開発には向かない

- Vite のホットリロードは使えない
- 修正のたびにビルドが走るので待ち時間が発生
- **しかし、インフラ学習としては最高**
- リバースプロキシの役割
- ビルド時の環境変数埋め込み
- コンテナ間ネットワークと名前解決
- ローカルで安全に「本番運用の落とし穴」を体験できました。


## 学んだ5つのポイント
- フロントは開発サーバーではなく、ビルド＋静的配信が本番向き
- Dokploy ではホストポートを直接使えない
- Vite 環境変数はビルド時に埋め込む必要がある
- ネットワーク分離によりサービス名での通信が失敗することがある
- ローカルでも`traefik.me`で本番ドメイン環境を再現できる


普段`docker compose up`で隠蔽されていた「ビルド」「ルーティング」「ネットワーク分離」という運用の壁に直面することで、インフラへの理解が深まりました。日々の開発はホットリロードが効くDocker Composeで行ない、CI/CDパイプラインの検証としてローカルPaaSを使う、という使い分けが最適解だと感じました。何かの参考になれば幸いです。

# 参考
- [Orbstack](https://orbstack.dev/)
- [Dokploy](https://dokploy.com/)
