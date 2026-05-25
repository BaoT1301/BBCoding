import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/instance'

export default function DashboardPage() {
  const { user, clearUser } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await api.post('/auth/logout')
    clearUser()
    navigate('/login')
  }

  return (
    <main>
      <h1>Dashboard</h1>
      <p>Welcome, {user?.email}</p>
      <button type="button" onClick={handleLogout}>Logout</button>
    </main>
  )
}
