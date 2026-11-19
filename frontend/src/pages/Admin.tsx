import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FormEvent, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Analytics, api, Category, SiteReport } from '../api'
import { useAuth } from '../auth'

const ALG: Record<string, string> = { item_cf: 'Item-based CF', user_cf: 'User-based CF', mf: 'Матрична факторизація', popularity: 'Популярність (база)' }
const STATUS: Record<string, string> = { new: 'Нове', in_progress: 'У роботі', resolved: 'Виправлено', dismissed: 'Відхилено' }
const pct = (n: number) => (n * 100).toFixed(1) + '%'

export default function Admin() {
  const { user, ready } = useAuth()
  const qc = useQueryClient()
  const an = useQuery({ queryKey: ['analytics'], queryFn: () => api<Analytics>('/admin/analytics?k=10'), enabled: user?.role === 'manager', refetchInterval: (q) => (q.state.data?.training.running ? 1500 : false) })
  const cats = useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('/categories') })
  const [msg, setMsg] = useState<string | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: ['analytics'] })
  const guard = (fn: () => Promise<unknown>) => async () => { setMsg(null); try { await fn(); refresh() } catch (e) { setMsg((e as Error).message) } }
  const train = useMutation({ mutationFn: () => api('/admin/train', { method: 'POST' }), onSuccess: refresh, onError: (e) => setMsg((e as Error).message) })
  const evaluate = useMutation({ mutationFn: () => api('/admin/evaluate', { method: 'POST' }), onSuccess: refresh, onError: (e) => setMsg((e as Error).message) })
  const [repFilter, setRepFilter] = useState('')
  const reports = useQuery({
    queryKey: ['site-reports', repFilter],
    queryFn: () => api<{ total: number; items: SiteReport[] }>('/admin/site-reports' + (repFilter ? `?status=${repFilter}` : '')),
    enabled: user?.role === 'manager',
  })
  const updReport = useMutation({
    mutationFn: (v: { id: number; status?: string; adminNote?: string }) => api(`/admin/site-reports/${v.id}`, { method: 'PATCH', body: { status: v.status, adminNote: v.adminNote } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['site-reports'] }),
    onError: (e) => setMsg((e as Error).message),
  })
  const [csv, setCsv] = useState('')
  const [prod, setProd] = useState({ categoryId: 1, title: '', price: 100, description: '' })

  if (ready && user?.role !== 'manager') return <Navigate to="/" />
  const d = an.data
  const best = d?.offline.length ? Math.max(...d.offline.map((o) => o.precision), 0.0001) : 1

  const importCsv = async (e: FormEvent) => { e.preventDefault(); await guard(async () => { const r = await api<{ imported: number; skipped: number }>('/admin/import', { method: 'POST', body: { csv } }); setMsg(`Імпортовано: ${r.imported}, пропущено: ${r.skipped}`) })() }
  const addProduct = async (e: FormEvent) => { e.preventDefault(); await guard(async () => { await api('/admin/products', { method: 'POST', body: { ...prod, categoryId: Number(prod.categoryId), price: Number(prod.price) } }); setMsg('Товар додано'); setProd({ ...prod, title: '', description: '' }) })() }
  const stopExp = guard(() => api(`/admin/experiments/${d!.experiment!.id}/stop`, { method: 'POST' }))
  const startExp = guard(() => api('/admin/experiments', { method: 'POST', body: { algorithmA: 'item_cf', algorithmB: 'mf', trafficSplit: 50 } }))

  return (
    <div className="container section">
      <h1>Аналітика рекомендацій</h1>
      {msg && <div className="card promo">{msg}</div>}
      {d && (
        <>
          <div className="stats-row card pad">
            <div><b>{d.totals.users}</b><span>користувачів</span></div><div><b>{d.totals.products}</b><span>товарів</span></div>
            <div><b>{d.totals.interactions}</b><span>взаємодій</span></div><div><b>{d.totals.impressions}</b><span>показів</span></div>
            <div><b>{d.totals.impressions ? pct(d.totals.clicks / d.totals.impressions) : '—'}</b><span>CTR</span></div>
          </div>

          <div className="section-head"><h2>Моделі</h2>
            <div className="hero-btns">
              <button className="btn btn-primary btn-sm" disabled={d.training.running || train.isPending} onClick={() => train.mutate()}>{d.training.running ? 'Навчання…' : 'Перенавчити'}</button>
              <button className="btn btn-ghost btn-sm" disabled={d.training.running || evaluate.isPending} onClick={() => evaluate.mutate()}>Оцінити якість</button>
            </div></div>
          {d.training.error && <p className="err">{d.training.error}</p>}
          <div className="card pad">
            <h3>Офлайн-метрики (k = 10)</h3>
            <table><thead><tr><th>Алгоритм</th><th>Precision@10</th><th>Recall@10</th><th></th></tr></thead>
              <tbody>{d.offline.map((o) => (
                <tr key={o.algorithm}><td>{ALG[o.algorithm] ?? o.algorithm}</td><td>{pct(o.precision)}</td><td>{pct(o.recall)}</td>
                  <td style={{ width: '40%' }}><div className="bar"><i style={{ width: `${(o.precision / best) * 100}%` }} /></div></td></tr>
              ))}</tbody></table>
          </div>

          <div className="card pad">
            <h3>Холодний старт: якість за довжиною історії (precision@10)</h3>
            <table><thead><tr><th>Алгоритм</th>{['1-2', '3-5', '6-10', '11+'].map((s) => <th key={s}>{s} подій</th>)}</tr></thead>
              <tbody>{d.offline.map((o) => (
                <tr key={o.algorithm}><td>{ALG[o.algorithm] ?? o.algorithm}</td>{['1-2', '3-5', '6-10', '11+'].map((s) => { const seg = o.segments.find((x) => x.segment === s); return <td key={s}>{seg ? pct(seg.precision) : '—'}</td> })}</tr>
              ))}</tbody></table>
          </div>

          <div className="card pad">
            <div className="section-head"><h3>A/B-експеримент</h3>
              {d.experiment ? <button className="btn btn-ghost btn-sm" onClick={stopExp}>Зупинити</button> : <button className="btn btn-primary btn-sm" onClick={startExp}>Запустити Item-CF vs MF</button>}</div>
            {d.experiment ? <p className="muted">Активний: A = {ALG[d.experiment.algorithmA]}, B = {ALG[d.experiment.algorithmB]}, частка B — {d.experiment.trafficSplit}%</p> : <p className="muted">Немає активного експерименту.</p>}
            <table><thead><tr><th>Алгоритм</th><th>Група</th><th>Покази</th><th>Кліки</th><th>CTR</th></tr></thead>
              <tbody>{d.online.map((o, i) => <tr key={i}><td>{ALG[o.algorithm] ?? o.algorithm}</td><td>{o.group ?? '—'}</td><td>{o.impressions}</td><td>{o.clicks}</td><td>{pct(o.ctr)}</td></tr>)}</tbody></table>
          </div>

          <div className="grid2">
            <form className="card pad form" onSubmit={importCsv}>
              <h3>Імпорт взаємодій (CSV)</h3>
              <p className="muted small">Колонки: user,product,event_type[,timestamp]. product — назва або id товару, event_type — view | select.</p>
              <textarea className="input" rows={5} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={'user,product,event_type\nuser1@example.com,Кабель USB-C Braid 1 м,view'} />
              <button className="btn btn-primary btn-sm" disabled={!csv.trim()}>Імпортувати</button>
            </form>
            <form className="card pad form" onSubmit={addProduct}>
              <h3>Додати товар</h3>
              <input className="input" required placeholder="Назва" value={prod.title} onChange={(e) => setProd({ ...prod, title: e.target.value })} />
              <select className="input" value={prod.categoryId} onChange={(e) => setProd({ ...prod, categoryId: Number(e.target.value) })}>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              <input className="input" type="number" min={0} required placeholder="Ціна" value={prod.price} onChange={(e) => setProd({ ...prod, price: Number(e.target.value) })} />
              <input className="input" placeholder="Опис" value={prod.description} onChange={(e) => setProd({ ...prod, description: e.target.value })} />
              <button className="btn btn-primary btn-sm">Додати</button>
            </form>
          </div>

          <div className="section-head"><h2>Скарги та помилки</h2>
            <select className="input" style={{ width: 'auto' }} value={repFilter} onChange={(e) => setRepFilter(e.target.value)}>
              <option value="">Усі стани</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></div>
          <div className="card pad">
            {reports.data?.items.length ? (
              <table><thead><tr><th>№</th><th>Тип</th><th>Тема і опис</th><th>Автор</th><th>Стан</th><th>Нотатка</th></tr></thead>
                <tbody>{reports.data.items.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td><td>{r.kind === 'bug' ? 'Помилка' : 'Скарга'}</td>
                    <td><b>{r.title}</b><div className="muted small">{r.message}</div></td>
                    <td>{r.author ?? 'гість'}</td>
                    <td><select className="input" value={r.status} onChange={(e) => updReport.mutate({ id: r.id, status: e.target.value })}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
                    <td><input className="input" defaultValue={r.adminNote ?? ''} placeholder="Нотатка" onBlur={(e) => e.target.value !== (r.adminNote ?? '') && updReport.mutate({ id: r.id, adminNote: e.target.value })} /></td>
                  </tr>
                ))}</tbody></table>
            ) : <p className="muted">Звернень немає.</p>}
          </div>
        </>
      )}
    </div>
  )
}
