import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { api, money } from '../api'
import { useAuth } from '../auth'
import { Visual } from '../components/ProductCard'
import { useCart } from '../hooks'

export default function Cart() {
  const { user, ready } = useAuth()
  const cart = useCart()
  const qc = useQueryClient()
  const [done, setDone] = useState(false)
  const refresh = () => qc.invalidateQueries({ queryKey: ['cart'] })
  const setQty = useMutation({ mutationFn: (v: { id: string; q: number }) => api(`/cart/${v.id}`, { method: 'PATCH', body: { quantity: v.q } }), onSuccess: refresh })
  const remove = useMutation({ mutationFn: (id: string) => api(`/cart/${id}`, { method: 'DELETE' }), onSuccess: refresh })
  if (ready && !user) return <Navigate to="/login" />
  const items = cart.data?.items ?? []
  return (
    <div className="container section">
      <h1>Кошик</h1>
      {done && <div className="card promo"><b>Дякуємо! Це демонстраційне оформлення — оплата не виконується.</b></div>}
      {items.length === 0 ? <div className="empty">Кошик порожній. <Link to="/catalog">Перейти до каталогу</Link></div> : (
        <div className="cart">
          <div className="cart-list">
            {items.map(({ product: p, quantity }) => (
              <div className="card cart-row" key={p.id}>
                <div className="cart-vis"><Visual p={p} /></div>
                <div className="cart-info"><Link to={`/product/${p.id}`} className="product-title">{p.title}</Link><span className="muted small">{p.category.name}</span></div>
                <div className="qty">
                  <button onClick={() => quantity > 1 ? setQty.mutate({ id: p.id, q: quantity - 1 }) : remove.mutate(p.id)}>−</button>
                  <span>{quantity}</span>
                  <button onClick={() => setQty.mutate({ id: p.id, q: Math.min(20, quantity + 1) })}>+</button>
                </div>
                <b>{money(p.price * quantity)}</b>
                <button className="icon-btn" onClick={() => remove.mutate(p.id)} aria-label="Видалити">✕</button>
              </div>
            ))}
          </div>
          <aside className="card summary">
            <h3>Разом</h3>
            <div className="price price-lg">{money(cart.data?.total ?? 0)}</div>
            <button className="btn btn-primary" onClick={() => { items.forEach((i) => remove.mutate(i.product.id)); setDone(true) }}>Оформити замовлення</button>
          </aside>
        </div>
      )}
    </div>
  )
}
