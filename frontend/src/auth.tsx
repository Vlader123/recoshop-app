import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, tokenStore, User } from './api'

interface AuthCtx {
  user: User | null
  ready: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name?: string) => Promise<void>
  logout: () => void
}
const Ctx = createContext<AuthCtx>(null!)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const qc = useQueryClient()

  useEffect(() => {
    if (!tokenStore.get()) { setReady(true); return }
    api<{ user: User }>('/auth/me').then((r) => setUser(r.user)).catch(() => tokenStore.set(null)).finally(() => setReady(true))
  }, [])

  const accept = useCallback((r: { user: User; token: string }) => {
    tokenStore.set(r.token); setUser(r.user); qc.clear()
  }, [qc])

  const value: AuthCtx = {
    user, ready,
    login: async (email, password) => accept(await api('/auth/login', { method: 'POST', body: { email, password } })),
    register: async (email, password, name) => accept(await api('/auth/register', { method: 'POST', body: { email, password, name: name || undefined } })),
    logout: () => { tokenStore.set(null); setUser(null); qc.clear() },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
