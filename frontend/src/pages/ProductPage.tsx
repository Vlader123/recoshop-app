import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api, money, Product } from '../api'
import { useAuth } from '../auth'
import ProductCard, { Visual } from '../components/ProductCard'
import { sendEvent, useAddToCart, useToggleFavorite } from '../hooks'

export default function ProductPage() {
  const { id = '' } = useParams()
  const [sp] = useSearchParams()
  const { user } = useAuth()
  const add = useAddToCart()
  const fav = useToggleFavorite()
  const p = useQuery({ queryKey: ['product', id, user?.id], queryFn: () => api<Product>(`/products/${id}`) })
  const similar = useQuery({ queryKey: ['similar', id, user?.id], queryFn: () => api<Product[]>(`/products/${id}/similar?limit=4`) })

  useEffect(() => {
    if (user) sendEvent(id, 'view', sp.get('rec') ? Number(sp.get('rec')) : undefined)
  }, [id, user?.id]) // eslint-disable-line

  if (p.isError) return <div className="container empty"><h1>Товар не знайдено</h1><Link to="/catalog" className="btn btn-primary">До каталогу</Link></div>
  if (!p.data) return <div className="container section muted">Завантаження…</div>
  const x = p.data
  return (
    <div className="container section">
      <p className="muted small"><Link to="/catalog">Каталог</Link> / <Link to={`/catalog?category=${x.category.slug}`}>{x.category.name}</Link></p>
      <div className="pdp">
        <Visual p={x} big />
        <div>
          <h1>{x.title}</h1>
          <div className="product-meta"><span className="stars">★ {x.rating.toFixed(1)}</span><span className="muted">{x.reviewsCount} відгуків</span></div>
          <div className="price price-lg">{money(x.price)}{x.oldPrice && <s>{money(x.oldPrice)}</s>}</div>
          <p className="lead">{x.description}</p>
          <div className="hero-btns">
            <button className="btn btn-primary" onClick={() => add(x)}>У кошик</button>
            <button className="btn btn-ghost" onClick={() => fav(x)}>{x.favorite ? '♥ В обраному' : '♡ В обране'}</button>
          </div>
        </div>
      </div>
      {similar.data && similar.data.length > 0 && (
        <section className="section"><h2>Схожі товари</h2><div className="grid4">{similar.data.map((s) => <ProductCard key={s.id} product={s} />)}</div></section>
      )}
    </div>
  )
}
