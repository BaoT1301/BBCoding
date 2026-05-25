import api from './instance'

export interface KPIs {
  revenue: number
  margin: number
  margin_pct: number
  units_sold: number
}

export interface WeeklyPoint {
  week_start: string
  revenue: number
  margin: number
  margin_pct: number
  units_sold: number
}

export interface AggregateResponse {
  kpis: KPIs
  weekly_series: WeeklyPoint[]
}

export interface StoreOption {
  id: number
  name: string
}

export interface FiltersResponse {
  stores: StoreOption[]
  categories: string[]
  brands: string[]
  vendors: string[]
  delivery_types: string[]
}

export interface AggregateParams {
  date_from: string
  date_to: string
  store_ids?: number[]
  categories?: string[]
  brands?: string[]
  vendors?: string[]
  delivery_types?: string[]
}

function buildParams(p: AggregateParams): URLSearchParams {
  const sp = new URLSearchParams()
  sp.set('date_from', p.date_from)
  sp.set('date_to', p.date_to)
  p.store_ids?.forEach((v) => sp.append('store_ids', String(v)))
  p.categories?.forEach((v) => sp.append('categories', v))
  p.brands?.forEach((v) => sp.append('brands', v))
  p.vendors?.forEach((v) => sp.append('vendors', v))
  p.delivery_types?.forEach((v) => sp.append('delivery_types', v))
  return sp
}

export async function fetchAggregate(params: AggregateParams): Promise<AggregateResponse> {
  const { data } = await api.get<AggregateResponse>('/analytics/aggregate', {
    params: buildParams(params),
  })
  return data
}

export async function fetchFilters(): Promise<FiltersResponse> {
  const { data } = await api.get<FiltersResponse>('/analytics/filters')
  return data
}
