import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AnalyticsPage from '../pages/AnalyticsPage'
import * as analyticsApi from '../api/analytics'

vi.mock('../api/analytics')

const mockAggregate: analyticsApi.AggregateResponse = {
  kpis: {
    revenue: 25_000_000,
    margin: 5_000_000,
    margin_pct: 20.0,
    units_sold: 8_500_000,
  },
  weekly_series: [
    {
      week_start: '2025-05-05',
      revenue: 25_000_000,
      margin: 5_000_000,
      margin_pct: 20.0,
      units_sold: 8_500_000,
    },
  ],
}

const mockFilters: analyticsApi.FiltersResponse = {
  stores: [{ id: 999999, name: 'BetterBasket Demo Store' }],
  categories: ['00100 - Fr Frozen'],
  brands: ['PURA VIDA'],
  vendors: ['00115'],
  delivery_types: ['Direct', 'Ground'],
}

beforeEach(() => {
  vi.mocked(analyticsApi.fetchAggregate).mockResolvedValue(mockAggregate)
  vi.mocked(analyticsApi.fetchFilters).mockResolvedValue(mockFilters)
})

function renderPage() {
  return render(
    <MemoryRouter>
      <AnalyticsPage />
    </MemoryRouter>,
  )
}

describe('AnalyticsPage', () => {
  it('renders all four KPI card labels', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Revenue \(\$\)/i)).toBeInTheDocument()
      expect(screen.getByText(/Margin \(\$\)/i)).toBeInTheDocument()
      expect(screen.getByText(/Margin \(%\)/i)).toBeInTheDocument()
      expect(screen.getByText(/Units Sold/i)).toBeInTheDocument()
    })
  })

  it('displays formatted revenue from the API response', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('$25.00M')).toBeInTheDocument()
    })
  })

  it('displays formatted margin percentage', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('20.0%')).toBeInTheDocument()
    })
  })
})
