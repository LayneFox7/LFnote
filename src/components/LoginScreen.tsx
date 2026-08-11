import { useState } from 'react'

interface LoginScreenProps {
  onLogin: (login: string, password: string) => Promise<void>
  onRegister: (login: string, password: string) => Promise<void>
}

export function LoginScreen({ onLogin, onRegister }: LoginScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!login.trim() || !password) {
      setError('Введите логин и пароль')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (mode === 'login') await onLogin(login.trim(), password)
      else await onRegister(login.trim(), password)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1 className="login-title">Планировщик недели</h1>
        <p className="login-sub">Ежедневник-планировщик с карточками, тегами и стрелками</p>

        <div className="login-tabs">
          <button
            className={`login-tab${mode === 'login' ? ' on' : ''}`}
            onClick={() => {
              setMode('login')
              setError('')
            }}
          >
            Вход
          </button>
          <button
            className={`login-tab${mode === 'register' ? ' on' : ''}`}
            onClick={() => {
              setMode('register')
              setError('')
            }}
          >
            Регистрация
          </button>
        </div>

        <form onSubmit={submit}>
          <input
            className="login-input"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            placeholder="Логин"
            maxLength={40}
            autoFocus
          />
          <input
            className="login-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Пароль"
            maxLength={100}
          />
          {error && <div className="login-error">{error}</div>}
          <button className="login-submit" type="submit" disabled={busy}>
            {busy ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
          </button>
        </form>

        <div className="login-hint">
          Демо-аккаунт: <code>demo</code> / <code>demo123</code>
        </div>
      </div>
    </div>
  )
}
