import { FormEvent, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'

export default function Login() {
  const { user, login, register } = useAuth()
  const nav = useNavigate()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [name, setName] = useState('')
  const [err, setErr] = useState<string | null>(null)
  if (user) return <Navigate to="/" />
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null)
    try { mode === 'login' ? await login(email, password) : await register(email, password, name); nav('/') }
    catch (x) { setErr((x as Error).message) }
  }
  return (
    <div className="container auth">
      <form className="card auth-card" onSubmit={submit}>
        <h1>{mode === 'login' ? 'Вхід' : 'Реєстрація'}</h1>
        {mode === 'register' && <input className="input" placeholder="Ім’я" value={name} onChange={(e) => setName(e.target.value)} />}
        <input className="input" type="email" required placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="input" type="password" required minLength={mode === 'register' ? 8 : 1} placeholder="Пароль" value={password} onChange={(e) => setPassword(e.target.value)} />
        {err && <p className="err">{err}</p>}
        <button className="btn btn-primary">{mode === 'login' ? 'Увійти' : 'Створити акаунт'}</button>
        <button type="button" className="link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Немає акаунта? Зареєструватися' : 'Вже є акаунт? Увійти'}
        </button>
        <div className="muted small demo">
          Демо: <a href="#" onClick={(e) => { e.preventDefault(); setEmail('demo@reco.shop'); setPassword('demo1234'); setMode('login') }}>demo@reco.shop / demo1234</a><br />
          Менеджер: <a href="#" onClick={(e) => { e.preventDefault(); setEmail('manager@reco.shop'); setPassword('manager123'); setMode('login') }}>manager@reco.shop / manager123</a>
        </div>
      </form>
    </div>
  )
}
