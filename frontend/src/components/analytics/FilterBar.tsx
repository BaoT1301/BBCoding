import type { FiltersResponse, StoreOption } from '../../api/analytics'

export interface FilterState {
  date_from: string
  date_to: string
  store_ids: number[]
  categories: string[]
  brands: string[]
  vendors: string[]
  delivery_types: string[]
}

interface FilterBarProps {
  filters: FiltersResponse | null
  value: FilterState
  onChange: (next: FilterState) => void
  loading: boolean
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: string[]
  selected: string[]
  onChange: (v: string[]) => void
}) {
  function toggle(opt: string) {
    onChange(
      selected.includes(opt) ? selected.filter((x) => x !== opt) : [...selected, opt],
    )
  }

  const displayLabel =
    selected.length === 0
      ? `All ${label}`
      : selected.length === 1
      ? selected[0].length > 18
        ? selected[0].slice(0, 18) + '…'
        : selected[0]
      : `${selected.length} ${label}`

  return (
    <div style={styles.selectWrapper}>
      <details style={styles.details}>
        <summary style={styles.summary}>
          {displayLabel} <span style={styles.chevron}>▾</span>
        </summary>
        <div style={styles.dropdown}>
          {options.length === 0 && <div style={styles.emptyOpt}>Loading…</div>}
          {options.map((opt) => (
            <label key={opt} style={styles.optionLabel}>
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
                style={{ marginRight: 6 }}
              />
              <span style={{ fontSize: 13 }}>{opt}</span>
            </label>
          ))}
        </div>
      </details>
    </div>
  )
}

export default function FilterBar({ filters, value, onChange, loading }: FilterBarProps) {
  function set<K extends keyof FilterState>(key: K, val: FilterState[K]) {
    onChange({ ...value, [key]: val })
  }

  const storeNames = (filters?.stores ?? []).map((s: StoreOption) => String(s.id))
  const selectedStoreNames = value.store_ids.map(String)

  return (
    <div style={styles.bar}>
      {/* Date range */}
      <label style={styles.dateLabel}>
        <span style={styles.dateLabelText}>From</span>
        <input
          type="date"
          value={value.date_from}
          onChange={(e) => set('date_from', e.target.value)}
          style={styles.dateInput}
        />
      </label>
      <label style={styles.dateLabel}>
        <span style={styles.dateLabelText}>To</span>
        <input
          type="date"
          value={value.date_to}
          onChange={(e) => set('date_to', e.target.value)}
          style={styles.dateInput}
        />
      </label>

      <div style={styles.divider} />

      {/* Categorical filters */}
      <MultiSelect
        label="Stores"
        options={storeNames}
        selected={selectedStoreNames}
        onChange={(v) => set('store_ids', v.map(Number))}
      />
      <MultiSelect
        label="Categories"
        options={filters?.categories ?? []}
        selected={value.categories}
        onChange={(v) => set('categories', v)}
      />
      <MultiSelect
        label="Brands"
        options={filters?.brands ?? []}
        selected={value.brands}
        onChange={(v) => set('brands', v)}
      />
      <MultiSelect
        label="Vendors"
        options={filters?.vendors ?? []}
        selected={value.vendors}
        onChange={(v) => set('vendors', v)}
      />
      <MultiSelect
        label="Delivery"
        options={filters?.delivery_types ?? []}
        selected={value.delivery_types}
        onChange={(v) => set('delivery_types', v)}
      />

      {loading && <span style={styles.loadingBadge}>Loading…</span>}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: '12px 16px',
  },
  dateLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 13,
    color: '#374151',
  },
  dateLabelText: {
    fontWeight: 600,
    color: '#6b7280',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  dateInput: {
    border: '1px solid #d1d5db',
    borderRadius: 6,
    padding: '5px 8px',
    fontSize: 13,
    color: '#111827',
    cursor: 'pointer',
  },
  divider: {
    width: 1,
    height: 28,
    background: '#e5e7eb',
  },
  selectWrapper: {
    position: 'relative',
  },
  details: {
    position: 'relative',
  },
  summary: {
    border: '1px solid #d1d5db',
    borderRadius: 6,
    padding: '5px 10px',
    fontSize: 13,
    cursor: 'pointer',
    listStyle: 'none',
    color: '#374151',
    background: '#f9fafb',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    userSelect: 'none',
  },
  chevron: {
    fontSize: 10,
    color: '#9ca3af',
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    zIndex: 50,
    marginTop: 4,
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    maxHeight: 280,
    overflowY: 'auto',
    minWidth: 220,
    padding: '6px 0',
  },
  optionLabel: {
    display: 'flex',
    alignItems: 'center',
    padding: '5px 12px',
    cursor: 'pointer',
  },
  emptyOpt: {
    padding: '8px 12px',
    fontSize: 13,
    color: '#9ca3af',
  },
  loadingBadge: {
    fontSize: 12,
    color: '#6b7280',
    marginLeft: 'auto',
  },
}
