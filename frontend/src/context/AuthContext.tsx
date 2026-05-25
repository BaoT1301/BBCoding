import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import api from '../api/instance'

interface User {
  id: string
  email: string
}

interface AuthContextValue {
  user: User | null
  loading: boolean
  refreshUser: () => Promise<void>
  clearUser: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshUser = async () => {
    try {
      const { data } = await api.get<User>('/auth/me')
      setUser(data)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  const clearUser = () => setUser(null)

  useEffect(() => {
    refreshUser()
  }, [])

  const value = useMemo(
    () => ({ user, loading, refreshUser, clearUser }),
    [user, loading]
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
