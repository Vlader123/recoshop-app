import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api, Cart, Product } from './api'
import { useAuth } from './auth'

export const useCart = () => {
  const { user } = useAuth()
  return useQuery({ queryKey: ['cart', user?.id], queryFn: () => api<Cart>('/cart'), enabled: !!user })
}

export function useAddToCart() {
  const { user } = useAuth()
  const nav = useNavigate()
  const qc = useQueryClient()
  const m = useMutation({
    mutationFn: (productId: string) => api('/cart', { method: 'POST', body: { productId, quantity: 1 } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cart'] }); qc.invalidateQueries({ queryKey: ['recommendations'] }) },
  })
  return (p: Product) => (user ? m.mutate(p.id) : nav('/login'))
}

export function useToggleFavorite() {
  const { user } = useAuth()
  const nav = useNavigate()
  const qc = useQueryClient()
  const m = useMutation({
    mutationFn: (p: Product) => api(`/favorites/${p.id}`, { method: p.favorite ? 'DELETE' : 'POST' }),
    onSuccess: () => { qc.invalidateQueries() },
  })
  return (p: Product) => (user ? m.mutate(p) : nav('/login'))
}

export const sendEvent = (productId: string, type: 'view' | 'select', recommendationId?: number) =>
  api('/events', { method: 'POST', body: { productId, type, recommendationId } }).catch(() => undefined)
