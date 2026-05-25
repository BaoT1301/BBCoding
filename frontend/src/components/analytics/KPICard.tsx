interface KPICardProps {
  label: string
  value: string
  delta?: string
  deltaPositive?: boolean
}

export default function KPICard({ label, value, delta, deltaPositive }: KPICardProps) {
  return (
    <div style={styles.card}>
      <p style={styles.label}>{label}</p>
      <p style={styles.value}>{value}</p>
      {delta !== undefined && (
        <p style={{ ...styles.delta, color: deltaPositive ? '#16a34a' : '#dc2626' }}>
          {delta}
        </p>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: '20px 24px',
    minWidth: 180,
    flex: 1,
  },
  label: {
    margin: 0,
    fontSize: 13,
    color: '#6b7280',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  value: {
    margin: '8px 0 4px',
    fontSize: 28,
    fontWeight: 700,
    color: '#111827',
  },
  delta: {
    margin: 0,
    fontSize: 13,
    fontWeight: 500,
  },
}
