import { useState } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import type { FormEvent } from 'react'
import api from '../api/instance'
import { useAuth } from '../context/AuthContext'

interface LocationState {
  successMessage?: string
}

function validateEmail(value: string): string {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    ? ''
    : 'Please enter a valid email address.'
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const { refreshUser } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const successMessage = (location.state as LocationState | null)?.successMessage

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const err = validateEmail(email)
    if (err) {
      setEmailError(err)
      return
    }
    setEmailError('')
    setServerError('')
    setSubmitting(true)
    try {
      await api.post('/auth/login', { email, password, remember_me: rememberMe })
      await refreshUser()
      navigate('/')
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status
      if (status === 401) setServerError('Invalid email or password.')
      else if (status === 429) setServerError('Too many attempts. Please wait.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main>
      <h1>Sign in</h1>
      {successMessage && <p role="status">{successMessage}</p>}
      <form onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          {emailError && <span role="alert">{emailError}</span>}
        </div>
        <div>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <div>
          <label>
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            {' '}Remember me
          </label>
        </div>
        {serverError && <p role="alert">{serverError}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p>No account? <Link to="/register">Register</Link></p>
    </main>
  )
}
