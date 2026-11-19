import { FormEvent, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { api } from '../api'

export default function Report() {
  const [params] = useSearchParams()
  const loc = useLocation()
  const [kind, setKind] = useState<'complaint' | 'bug'>(params.get('kind') === 'complaint' ? 'complaint' : 'bug')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [sent, setSent] = useState<number | null>(null)
  const from = params.get('from') ?? '/'

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null)
    try {
      const r = await api<{ id: number }>('/site-reports', { method: 'POST', body: { kind, title, message, page: from || loc.pathname } })
      setSent(r.id)
    } catch (x) { setErr((x as Error).message) }
  }

  if (sent !== null)
    return (
      <div className="container auth">
        <div className="card auth-card">
          <h1>Дякуємо!</h1>
          <p>Звернення №{sent} прийнято. Адміністратор перевірить його та змінить статус.</p>
          <Link className="btn btn-primary" to="/">На головну</Link>
        </div>
      </div>
    )

  return (
    <div className="container auth">
      <form className="card auth-card" onSubmit={submit}>
        <h1>Підтримка</h1>
        <div className="tabs">
          <button type="button" className={kind === 'bug' ? 'on' : ''} onClick={() => setKind('bug')}>Помилка</button>
          <button type="button" className={kind === 'complaint' ? 'on' : ''} onClick={() => setKind('complaint')}>Скарга</button>
        </div>
        <input className="input" required minLength={3} maxLength={150} placeholder="Тема" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="input" required minLength={10} maxLength={5000} rows={5} placeholder="Опишіть, що сталося (від 10 символів)" value={message} onChange={(e) => setMessage(e.target.value)} />
        {err && <p className="err">{err}</p>}
        <button className="btn btn-primary">Надіслати</button>
      </form>
    </div>
  )
}
