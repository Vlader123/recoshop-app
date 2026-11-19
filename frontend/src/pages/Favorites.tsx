import { useQuery } from '@tanstack/react-query'
import { Link, Navigate } from 'react-router-dom'
import { api, Product } from '../api'
import { useAuth } from '../auth'
import ProductCard from '../components/ProductCard'

export default function Favorites() {
  const { user, ready } = useAuth()
  const fav = useQuery({ queryKey: ['favorites', user?.id], queryFn: () => api<Product[]>('/favorites'), enabled: !!user })
  if (ready && !user) return <Navigate to="/login" />
  return (
    <div className="container section">
      <h1>Обране</h1>
      {fav.data?.length === 0 && <div className="empty">Ще нічого не обрано. <Link to="/catalog">До каталогу</Link></div>}
      <div className="grid4">{fav.data?.map((p) => <ProductCard key={p.id} product={p} />)}</div>
    </div>
  )
}
