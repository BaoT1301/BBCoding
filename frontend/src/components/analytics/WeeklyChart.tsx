import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { WeeklyPoint } from '../../api/analytics'

interface WeeklyChartProps {
  readonly data: WeeklyPoint[]
}

function formatM(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${value.toFixed(0)}`
}

function formatWeek(iso: string) {
  const d = new Date(iso)
  return `Wk ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

export default function WeeklyChart({ data }: WeeklyChartProps) {
  if (data.length === 0) {
    return (
      <div style={styles.empty}>No data for selected filters</div>
    )
  }

  const chartData = data.map((pt) => ({
    week: formatWeek(pt.week_start),
    Revenue: pt.revenue,
    Margin: pt.margin,
  }))

  return (
    <div style={styles.wrapper}>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ top: 8, right: 24, left: 16, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="week" tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={formatM} tick={{ fontSize: 12 }} width={72} />
          <Tooltip
            formatter={(value, name) => [
              typeof value === 'number' ? formatM(value) : String(value),
              String(name),
            ]}
            contentStyle={{ fontSize: 13 }}
          />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          <Line
            type="monotone"
            dataKey="Revenue"
            stroke="#f97316"
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
          />
          <Line
            type="monotone"
            dataKey="Margin"
            stroke="#1e293b"
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: '20px 8px 8px',
  },
  empty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 320,
    color: '#9ca3af',
    fontSize: 14,
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
  },
}
