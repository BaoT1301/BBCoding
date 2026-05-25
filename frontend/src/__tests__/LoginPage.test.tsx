import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { AuthProvider } from '../context/AuthContext'
import ProtectedRoute from '../components/ProtectedRoute'
import LoginPage from '../pages/LoginPage'
import api from '../api/instance'

vi.mock('../api/instance', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: { response: { use: vi.fn() } },
  },
}))

const mockedApi = api as unknown as {
  get: ReturnType<typeof vi.fn>
  post: ReturnType<typeof vi.fn>
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<div>Dashboard</div>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete (globalThis as { location?: unknown }).location
    ;(globalThis as { location: unknown }).location = { href: '', pathname: '/login' }
  })

  it('renders email, password, remember-me checkbox, and submit button', async () => {
    mockedApi.get.mockRejectedValueOnce(new Error('Unauthorized'))
    renderPage()
    await waitFor(() => expect(screen.getByLabelText(/email/i)).toBeInTheDocument())
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /remember me/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('shows validation error for malformed email without calling the API', async () => {
    mockedApi.get.mockRejectedValueOnce(new Error('Unauthorized'))
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => screen.getByLabelText(/email/i))

    await user.type(screen.getByLabelText(/email/i), 'not-an-email')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(screen.getByText(/valid email/i)).toBeInTheDocument()
    expect(mockedApi.post).not.toHaveBeenCalled()
  })

  it('navigates to / after a successful 200 response', async () => {
    mockedApi.get
      .mockRejectedValueOnce(new Error('Unauthorized'))
      .mockResolvedValueOnce({ data: { id: 'u1', email: 'test@example.com' } })
    mockedApi.post.mockResolvedValueOnce({ data: { email: 'test@example.com' } })

    const user = userEvent.setup()
    renderPage()
    await waitFor(() => screen.getByLabelText(/email/i))

    await user.type(screen.getByLabelText(/email/i), 'test@example.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => expect(screen.getByText('Dashboard')).toBeInTheDocument())
  })

  it('shows "Invalid email or password." on a 401 response', async () => {
    mockedApi.get.mockRejectedValueOnce(new Error('Unauthorized'))
    mockedApi.post.mockRejectedValueOnce({ response: { status: 401 } })

    const user = userEvent.setup()
    renderPage()
    await waitFor(() => screen.getByLabelText(/email/i))

    await user.type(screen.getByLabelText(/email/i), 'test@example.com')
    await user.type(screen.getByLabelText(/password/i), 'wrongpassword')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() =>
      expect(screen.getByText('Invalid email or password.')).toBeInTheDocument()
    )
  })

  it('sends remember_me: true when the checkbox is checked', async () => {
    mockedApi.get
      .mockRejectedValueOnce(new Error('Unauthorized'))
      .mockRejectedValueOnce(new Error('Unauthorized'))
    mockedApi.post.mockResolvedValueOnce({ data: { email: 'test@example.com' } })

    const user = userEvent.setup()
    renderPage()
    await waitFor(() => screen.getByLabelText(/email/i))

    await user.type(screen.getByLabelText(/email/i), 'test@example.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('checkbox', { name: /remember me/i }))
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() =>
      expect(mockedApi.post).toHaveBeenCalledWith('/auth/login', {
        email: 'test@example.com',
        password: 'password123',
        remember_me: true,
      })
    )
  })
})
