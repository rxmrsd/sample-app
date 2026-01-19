# Sample Todo App

フロントエンド、バックエンド、DBを含むフルスタックTodoアプリケーション

## 技術スタック

- **Frontend**: React + TypeScript (Vite)
- **Backend**: Go (gorilla/mux)
- **Database**: PostgreSQL

## ディレクトリ構成

```
sample-app/
├── frontend/          # React + TypeScript
├── backend/           # Go API
├── compose.yaml
└── README.md
```

## 起動方法

### Docker Composeで起動（推奨）

```bash
docker compose up --build
```

起動後、以下のURLでアクセスできます：
- Frontend: http://localhost:5173
- Backend API: http://localhost:8080
- PostgreSQL: localhost:5432

### 停止

```bash
docker compose down
```

データも削除する場合：

```bash
docker compose down -v
```

## API エンドポイント

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/todos | Todo一覧取得 |
| POST | /api/todos | Todo作成 |
| PUT | /api/todos/:id | Todo更新 |
| DELETE | /api/todos/:id | Todo削除 |
| GET | /api/health | ヘルスチェック |

## ローカル開発（Docker不使用）

### Backend

```bash
cd backend
go mod tidy
DATABASE_URL="postgres://postgres:postgres@localhost:5432/todoapp?sslmode=disable" go run main.go
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```
