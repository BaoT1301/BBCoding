import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import type { FormEvent } from 'react'
import api from '../api/instance'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const navigate = useNavigate()

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {}
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      e.email = 'Please enter a valid email address.'
    if (password.length < 8)
      e.password = 'Password must be at least 8 characters.'
    if (password !== confirmPassword)
      e.confirmPassword = 'Passwords do not match.'
    return e
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }
    setErrors({})
    setServerError('')
    setSubmitting(true)
    try {
      await api.post('/auth/register', { email, password })
      navigate('/login', { state: { successMessage: 'Account created! Please sign in.' } })
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status
      if (status === 409)
        setServerError('An account with this email already exists.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main>
      <h1>Create account</h1>
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
          {errors.email && <span role="alert">{errors.email}</span>}
        </div>
        <div>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          {errors.password && <span role="alert">{errors.password}</span>}
        </div>
        <div>
          <label htmlFor="confirmPassword">Confirm password</label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
          {errors.confirmPassword && <span role="alert">{errors.confirmPassword}</span>}
        </div>
        {serverError && <p role="alert">{serverError}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p>Already have an account? <Link to="/login">Sign in</Link></p>
    </main>
  )
}
