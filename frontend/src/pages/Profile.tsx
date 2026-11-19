import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { api, Profile as P } from '../api'
import { useAuth } from '../auth'

export default function Profile() {
  const { user, ready } = useAuth()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['profile', user?.id], queryFn: () => api<P>('/profile'), enabled: !!user })
  const wipe = useMutation({ mutationFn: () => api('/profile/history', { method: 'DELETE' }), onSuccess: () => qc.invalidateQueries() })
  if (ready && !user) return <Navigate to="/login" />
  const d = q.data
  const max = Math.max(1, ...(d?.profile.topCategories.map((c) => c.weight) ?? [1]))
  return (
    <div className="container section">
      <h1>Профіль</h1>
      {d && (
        <div className="grid2">
          <div className="card pad">
            <h3>{d.user.name ?? d.user.email}</h3>
            <p className="muted">{d.user.email}</p>
            <div className="stats-row">
              <div><b>{d.profile.interactionsCount}</b><span>взаємодій</span></div>
              <div><b>{d.counts.favorites}</b><span>в обраному</span></div>
              <div><b>{d.counts.cart}</b><span>у кошику</span></div>
            </div>
            {d.user.group && <p className="muted small">Група A/B-експерименту: {d.user.group}</p>}
          </div>
          <div className="card pad">
            <h3>Ваші вподобання</h3>
            {d.profile.topCategories.length === 0 && <p className="muted">Перегляньте кілька товарів — і тут з’являться ваші категорії.</p>}
            {d.profile.topCategories.map((c) => (
              <div className="bar-row" key={c.slug}><span>{c.name}</span><div className="bar"><i style={{ width: `${(c.weight / max) * 100}%` }} /></div></div>
            ))}
            <button className="btn btn-ghost btn-sm" disabled={wipe.isPending} onClick={() => confirm('Видалити всю історію переглядів?') && wipe.mutate()}>Видалити мою історію</button>
          </div>
        </div>
      )}
    </div>
  )
}
