import { Link } from 'react-router-dom'
import { money, Product } from '../api'
import { useAddToCart, useToggleFavorite } from '../hooks'

export function Visual({ p, big }: { p: Product; big?: boolean }) {
  return (
    <div className={`visual g${p.gradient % 8} ${big ? 'visual-big' : ''}`}>
      {p.imageUrl ? <img src={p.imageUrl} alt={p.title} loading="lazy" /> : <span className="visual-icon">{p.category.icon ?? '🛍'}</span>}
      {p.badge && <span className="badge">{p.badge}</span>}
      {p.discountPercent ? <span className="badge badge-sale">−{p.discountPercent}%</span> : null}
    </div>
  )
}

interface Props {
  product: Product
  matchPercent?: number | null
  reason?: string
  label?: string
  big?: boolean
  to?: string
  onOpen?: () => void
}

export default function ProductCard({ product: p, matchPercent, reason, label, big, to, onOpen }: Props) {
  const add = useAddToCart()
  const fav = useToggleFavorite()
  return (
    <article className={`card product ${big ? 'product-big' : ''}`}>
      <Link to={to ?? `/product/${p.id}`} onClick={onOpen} className="product-link">
        <Visual p={p} big={big} />
        {matchPercent ? <span className="match">{matchPercent}% збіг</span> : null}
        {label && <span className="label-chip">{label}</span>}
      </Link>
      <button className={`heart ${p.favorite ? 'on' : ''}`} onClick={() => fav(p)} aria-label="В обране">{p.favorite ? '♥' : '♡'}</button>
      <div className="product-body">
        <Link to={to ?? `/product/${p.id}`} onClick={onOpen} className="product-title">{p.title}</Link>
        {reason && <div className="reason"><span>✦</span> {reason}</div>}
        <div className="product-meta"><span className="stars">★ {p.rating.toFixed(1)}</span><span className="muted small">({p.reviewsCount})</span></div>
        <div className="product-foot">
          <div className="price">{money(p.price)}{p.oldPrice && <s>{money(p.oldPrice)}</s>}</div>
          <button className="btn btn-primary btn-sm" onClick={() => add(p)}>У кошик</button>
        </div>
      </div>
    </article>
  )
}
