import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { api, Category, Product } from '../api'
import ProductCard from '../components/ProductCard'
import { useAuth } from '../auth'

const SORTS = [['popular', 'За популярністю'], ['rating', 'За рейтингом'], ['price_asc', 'Спочатку дешевші'], ['price_desc', 'Спочатку дорожчі'], ['new', 'Новинки']]

export default function Catalog() {
  const { user } = useAuth()
  const [sp, setSp] = useSearchParams()
  const q = sp.get('q') ?? '', category = sp.get('category') ?? '', sort = sp.get('sort') ?? 'popular', page = Number(sp.get('page') ?? 1), discount = sp.get('discount') === 'true'
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); if (k !== 'page') n.delete('page'); setSp(n) }
  const cats = useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('/categories') })
  const params = new URLSearchParams({ sort, page: String(page), limit: '12' })
  if (q) params.set('q', q); if (category) params.set('category', category); if (discount) params.set('discount', 'true')
  const list = useQuery({ queryKey: ['products', params.toString(), user?.id], queryFn: () => api<{ items: Product[]; total: number; limit: number }>(`/products?${params}`) })
  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / 12))

  return (
    <div className="container section">
      <h1>Каталог</h1>
      <div className="filters">
        <input className="input" placeholder="Пошук…" value={q} onChange={(e) => set('q', e.target.value)} />
        <select className="input" value={category} onChange={(e) => set('category', e.target.value)}>
          <option value="">Усі категорії</option>
          {cats.data?.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
        </select>
        <select className="input" value={sort} onChange={(e) => set('sort', e.target.value)}>{SORTS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
        <label className="check"><input type="checkbox" checked={discount} onChange={(e) => set('discount', e.target.checked ? 'true' : '')} /> Лише зі знижкою</label>
      </div>
      <p className="muted small">Знайдено: {list.data?.total ?? '…'}</p>
      {list.data && list.data.items.length === 0 && <div className="empty">Нічого не знайдено. Спробуйте змінити фільтри.</div>}
      <div className="grid4">{list.data?.items.map((p) => <ProductCard key={p.id} product={p} />)}</div>
      {pages > 1 && (
        <div className="pager">
          <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => set('page', String(page - 1))}>←</button>
          <span>{page} / {pages}</span>
          <button className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => set('page', String(page + 1))}>→</button>
        </div>
      )}
    </div>
  )
}
