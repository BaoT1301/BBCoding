import { useEffect, useState, useCallback } from 'react'
import { fetchAggregate, fetchFilters } from '../api/analytics'
import type { AggregateResponse, FiltersResponse } from '../api/analytics'
import KPICard from '../components/analytics/KPICard'
import WeeklyChart from '../components/analytics/WeeklyChart'
import FilterBar from '../components/analytics/FilterBar'
import type { FilterState } from '../components/analytics/FilterBar'

function twoMonthsAgo(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - 2)
  return d.toISOString().split('T')[0]
}

function today(): string {
  return new Date().toISOString().split('T')[0]
}

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}

function formatPct(n: number): string {
  return `${n.toFixed(1)}%`
}

function formatUnits(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export default function AnalyticsPage() {
  const [filterOptions, setFilterOptions] = useState<FiltersResponse | null>(null)
  const [filterState, setFilterState] = useState<FilterState>({
    date_from: twoMonthsAgo(),
    date_to: today(),
    store_ids: [],
    categories: [],
    brands: [],
    vendors: [],
    delivery_types: [],
  })
  const [data, setData] = useState<AggregateResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchFilters().then(setFilterOptions).catch(() => {
      // filters are non-critical; page still works without them
    })
  }, [])

  const loadData = useCallback(async (fs: FilterState) => {
    if (!fs.date_from || !fs.date_to) return
    setLoading(true)
    setError(null)
    try {
      const result = await fetchAggregate({
        date_from: fs.date_from,
        date_to: fs.date_to,
        store_ids: fs.store_ids.length > 0 ? fs.store_ids : undefined,
        categories: fs.categories.length > 0 ? fs.categories : undefined,
        brands: fs.brands.length > 0 ? fs.brands : undefined,
        vendors: fs.vendors.length > 0 ? fs.vendors : undefined,
        delivery_types: fs.delivery_types.length > 0 ? fs.delivery_types : undefined,
      })
      setData(result)
    } catch {
      setError('Failed to load analytics data. Check your connection.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData(filterState)
  }, [filterState, loadData])

  const kpis = data?.kpis

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>Analytics</h1>
        <p style={styles.subtitle}>Aggregate performance — BetterBasket</p>
      </header>

      <FilterBar
        filters={filterOptions}
        value={filterState}
        onChange={setFilterState}
        loading={loading}
      />

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.kpiRow}>
        <KPICard
          label="Revenue ($)"
          value={kpis ? formatCurrency(kpis.revenue) : '—'}
        />
        <KPICard
          label="Margin ($)"
          value={kpis ? formatCurrency(kpis.margin) : '—'}
        />
        <KPICard
          label="Margin (%)"
          value={kpis ? formatPct(kpis.margin_pct) : '—'}
        />
        <KPICard
          label="Units Sold"
          value={kpis ? formatUnits(kpis.units_sold) : '—'}
        />
      </div>

      <div style={styles.chartTitle}>
        Weekly Revenue vs Margin
      </div>
      <WeeklyChart data={data?.weekly_series ?? []} />
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '32px 24px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    background: '#f9fafb',
    minHeight: '100vh',
  },
  header: {
    marginBottom: 4,
  },
  title: {
    margin: 0,
    fontSize: 28,
    fontWeight: 700,
    color: '#111827',
  },
  subtitle: {
    margin: '4px 0 0',
    fontSize: 14,
    color: '#6b7280',
  },
  kpiRow: {
    display: 'flex',
    gap: 16,
    flexWrap: 'wrap',
  },
  chartTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: '#374151',
    marginBottom: -8,
  },
  error: {
    background: '#fef2f2',
    border: '1px solid #fca5a5',
    borderRadius: 8,
    padding: '12px 16px',
    color: '#dc2626',
    fontSize: 14,
  },
}
