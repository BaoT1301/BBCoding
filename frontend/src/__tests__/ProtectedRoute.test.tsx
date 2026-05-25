import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { AuthProvider } from '../context/AuthContext'
import ProtectedRoute from '../components/ProtectedRoute'
import api from '../api/instance'

vi.mock('../api/instance', () => ({
  default: {
    get: vi.fn(),
    interceptors: {
      response: { use: vi.fn() },
    },
  },
}))

const mockedApi = api as unknown as { get: ReturnType<typeof vi.fn> }

function renderWithRouter(authenticated: boolean) {
  mockedApi.get.mockResolvedValueOnce(
    authenticated
      ? { data: { id: 'abc-123', email: 'user@example.com' } }
      : Promise.reject(new Error('Unauthorized'))
  )

  return render(
    <MemoryRouter initialEntries={['/']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<div>Login page</div>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<div>Protected content</div>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  )
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete (globalThis as { location?: unknown }).location
    ;(globalThis as { location: unknown }).location = { href: '' }
  })

  it('redirects unauthenticated users to /login', async () => {
    renderWithRouter(false)
    await waitFor(() => {
      expect(screen.getByText('Login page')).toBeInTheDocument()
    })
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
  })

  it('renders the outlet for authenticated users', async () => {
    renderWithRouter(true)
    await waitFor(() => {
      expect(screen.getByText('Protected content')).toBeInTheDocument()
    })
    expect(screen.queryByText('Login page')).not.toBeInTheDocument()
  })
})
