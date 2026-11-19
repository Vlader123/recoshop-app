export const API_BASE: string = import.meta.env.VITE_API_URL ?? ''
export interface Category { id: number; slug: string; name: string; icon: string | null; products: number }
export interface Product {
  id: string; title: string; description: string | null; price: number; oldPrice: number | null
  discountPercent: number | null; rating: number; reviewsCount: number; badge: string | null
  imageUrl: string | null; gradient: number; createdAt: string
  category: { id: number; slug: string; name: string; icon: string | null }; favorite?: boolean
}
export interface RecoItem {
  id: number; rank: number; score: number; matchPercent: number | null; algorithm: string
  reason: { type: string; text: string }; product: Product
}
export interface User { id: string; email: string; name: string | null; role: 'customer' | 'manager' }
export interface Cart { items: { quantity: number; product: Product }[]; count: number; total: number }
export interface Profile {
  user: User & { group: 'A' | 'B' | null }
  profile: { topCategories: { slug: string; name: string; weight: number }[]; interactionsCount: number }
  counts: { favorites: number; cart: number; viewed: number }
}
export interface Analytics {
  totals: { users: number; products: number; interactions: number; categories: number; impressions: number; clicks: number }
  offline: { algorithm: string; k: number; precision: number; recall: number; users: number; segments: { segment: string; precision: number; recall: number; users: number }[] }[]
  online: { algorithm: string; group: string | null; impressions: number; clicks: number; users: number; ctr: number }[]
  experiment: { id: number; algorithmA: string; algorithmB: string; trafficSplit: number; status: string } | null
  training: { running: boolean; error: string | null; finishedAt: string | null; trainedModels: { algorithm: string; ms: number }[] }
}

export interface SiteReport {
  id: number; kind: 'complaint' | 'bug'; title: string; message: string; page: string | null
  status: 'new' | 'in_progress' | 'resolved' | 'dismissed'; adminNote: string | null
  author: string | null; handledBy: string | null; createdAt: string; updatedAt: string
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message) }
}

export const tokenStore = {
  get: () => { try { return localStorage.getItem('reco_token') } catch { return null } },
  set: (t: string | null) => { try { t ? localStorage.setItem('reco_token', t) : localStorage.removeItem('reco_token') } catch { /* ignore */ } },
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = tokenStore.get()
  const res = await fetch(API_BASE + '/api' + path, {
    method: opts.method ?? 'GET',
    headers: { ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? 'ERROR', data?.error?.message ?? 'Помилка запиту')
  return data as T
}

export const money = (n: number) => new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(n) + ' ₴'
