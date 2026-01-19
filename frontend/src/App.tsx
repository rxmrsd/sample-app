import { useState, useEffect } from 'react'

interface Todo {
  id: number
  title: string
  completed: boolean
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'

function App() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [newTodo, setNewTodo] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchTodos()
  }, [])

  const fetchTodos = async () => {
    try {
      const res = await fetch(`${API_URL}/api/todos`)
      if (!res.ok) throw new Error('Failed to fetch todos')
      const data = await res.json()
      setTodos(data)
      setError(null)
    } catch (err) {
      setError('Failed to load todos')
    } finally {
      setLoading(false)
    }
  }

  const addTodo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTodo.trim()) return

    try {
      const res = await fetch(`${API_URL}/api/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTodo, completed: false }),
      })
      if (!res.ok) throw new Error('Failed to add todo')
      const todo = await res.json()
      setTodos([...todos, todo])
      setNewTodo('')
    } catch (err) {
      setError('Failed to add todo')
    }
  }

  const toggleTodo = async (todo: Todo) => {
    try {
      const res = await fetch(`${API_URL}/api/todos/${todo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...todo, completed: !todo.completed }),
      })
      if (!res.ok) throw new Error('Failed to update todo')
      setTodos(todos.map(t =>
        t.id === todo.id ? { ...t, completed: !t.completed } : t
      ))
    } catch (err) {
      setError('Failed to update todo')
    }
  }

  const deleteTodo = async (id: number) => {
    try {
      const res = await fetch(`${API_URL}/api/todos/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete todo')
      setTodos(todos.filter(t => t.id !== id))
    } catch (err) {
      setError('Failed to delete todo')
    }
  }

  if (loading) return <div className="container">Loading...</div>

  return (
    <div className="container">
      <h1>Todo App</h1>

      {error && <div className="error">{error}</div>}

      <form onSubmit={addTodo} className="form">
        <input
          type="text"
          value={newTodo}
          onChange={(e) => setNewTodo(e.target.value)}
          placeholder="Add a new todo..."
          className="input"
        />
        <button type="submit" className="btn btn-primary">Add</button>
      </form>

      <ul className="todo-list">
        {todos.map(todo => (
          <li key={todo.id} className="todo-item">
            <label className="todo-label">
              <input
                type="checkbox"
                checked={todo.completed}
                onChange={() => toggleTodo(todo)}
              />
              <span className={todo.completed ? 'completed' : ''}>
                {todo.title}
              </span>
            </label>
            <button
              onClick={() => deleteTodo(todo.id)}
              className="btn btn-danger"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>

      {todos.length === 0 && (
        <p className="empty">No todos yet. Add one above!</p>
      )}
    </div>
  )
}

export default App
