import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { authGetMe, authSignIn, authSignUp, setAuthToken } from '../api'
import type { AuthUser } from '../api'

type AuthContextValue = {
  user: AuthUser | null
  loading: boolean
  signIn: (email: string, password: string, role?: string) => Promise<void>
  signUp: (email: string, password: string, displayName?: string) => Promise<void>
  signOut: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    authGetMe()
      .then((u) => setUser(u ?? null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const signIn = useCallback(async (email: string, password: string, role?: string) => {
    const { user: u, access_token } = await authSignIn(email, password, role)
    setAuthToken(access_token)
    setUser(u)
  }, [])

  const signUp = useCallback(async (email: string, password: string, displayName?: string) => {
    const { user: u, access_token } = await authSignUp(email, password, displayName)
    setAuthToken(access_token)
    setUser(u)
  }, [])

  const signOut = useCallback(() => {
    setAuthToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
