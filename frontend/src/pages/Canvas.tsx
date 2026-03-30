import { useState, useCallback, useEffect, useRef } from 'react'
import { Responsive, WidthProvider } from 'react-grid-layout/legacy'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BarChart, Bar, LabelList, AreaChart, Area,
  PieChart, Pie, Cell, Sankey,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Plus, X, Settings2, Save, Check, GripVertical, BarChart2, TrendingUp, TrendingDown, PieChart as PieIcon, GitBranch, Hash, AlertCircle, Pencil } from 'lucide-react'
import { canvasApi, insightsApi, merchantsApi } from '../lib/api'
import type { CanvasWidget, CanvasLayoutItem, CanvasMeta, WidgetType, WidgetSource } from '../lib/api'
import { useFilters } from '../context/FilterContext'
import { useTheme } from '../context/ThemeContext'
import { formatCurrency, formatMonth, truncate, CHART_COLORS_DARK, CHART_COLORS_LIGHT } from '../lib/utils'

import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

const ResponsiveGridLayout = WidthProvider(Responsive)

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_SIZES: Record<WidgetType, { w: number; h: number }> = {
  metric:  { w: 3, h: 3 },
  bar:     { w: 6, h: 5 },
  line:    { w: 6, h: 5 },
  pie:     { w: 4, h: 5 },
  sankey:  { w: 8, h: 7 },
}

const WIDGET_SOURCES: Record<WidgetType, WidgetSource[]> = {
  metric:  ['summary'],
  bar:     ['categories', 'monthly', 'merchants', 'dow'],
  line:    ['monthly'],
  pie:     ['categories', 'merchants'],
  sankey:  ['sankey'],
}

const METRIC_FIELDS = [
  { value: 'total_spent',       label: 'Total Spent' },
  { value: 'transaction_count', label: 'Transactions' },
  { value: 'net_spend',         label: 'Net Spend' },
  { value: 'this_month',        label: 'This Month' },
  { value: 'last_month',        label: 'Last Month' },
  { value: 'delta_pct',         label: 'Month-over-Month %' },
]

const SOURCE_LABELS: Record<WidgetSource, string> = {
  categories: 'By Category',
  monthly:    'By Month',
  merchants:  'By Merchant',
  dow:        'By Day of Week',
  summary:    'Summary',
  sankey:     'Flow (Institution → Category)',
}

const TYPE_META: Record<WidgetType, { label: string; icon: React.ElementType; description: string }> = {
  metric:  { label: 'Metric',      icon: Hash,       description: 'Single KPI number' },
  bar:     { label: 'Bar Chart',   icon: BarChart2,  description: 'Compare categories, months, merchants' },
  line:    { label: 'Trend Line',  icon: TrendingUp, description: 'Spending over time' },
  pie:     { label: 'Pie Chart',   icon: PieIcon,    description: 'Breakdown by share' },
  sankey:  { label: 'Flow Chart',  icon: GitBranch,  description: 'How money flows from accounts to categories' },
}

function uid() { return Math.random().toString(36).slice(2, 9) }

// ── Shared helpers ─────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: 'var(--color-surface-raise)', border: '1px solid var(--color-border)', fontSize: 12 }}>
      {label && <p style={{ color: 'var(--color-text-muted)', marginBottom: 2 }}>{label}</p>}
      <p style={{ color: 'var(--color-text-primary)', fontFamily: 'monospace', fontWeight: 600 }}>
        {formatCurrency(payload[0].value)}
      </p>
    </div>
  )
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-full" style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>
      {label}
    </div>
  )
}

// ── Widget renderers ──────────────────────────────────────────────────────────

function MetricWidget({ widget, filters }: { widget: CanvasWidget; filters: ReturnType<typeof useFilters> }) {
  const { data, isLoading } = useQuery({
    queryKey: ['summary', filters.range, filters.institution, filters.account],
    queryFn: () => insightsApi.summary({ range: filters.range, institution: filters.institution, account: filters.account }),
    staleTime: 30_000,
  })

  const field = widget.config.field ?? 'total_spent'
  const raw = data ? (data as unknown as Record<string, unknown>)[field] : undefined
  const value = typeof raw === 'number' ? raw : null
  const isPercent = field === 'delta_pct'
  const isPositiveGood = field === 'net_spend' || field === 'delta_pct'
  const color = value === null ? 'var(--color-text-primary)'
    : isPositiveGood
      ? value >= 0 ? 'var(--color-positive, #5abf8a)' : '#e86060'
      : 'var(--color-text-primary)'

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <div style={{ width: 80, height: 20, borderRadius: 4, background: 'var(--color-border)', opacity: 0.5 }} />
        <div style={{ width: 50, height: 12, borderRadius: 4, background: 'var(--color-border)', opacity: 0.3 }} />
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-2">
      {isPercent && value !== null && (
        value >= 0
          ? <TrendingUp size={18} style={{ color: '#e86060' }} />
          : <TrendingDown size={18} style={{ color: 'var(--color-positive, #5abf8a)' }} />
      )}
      <span style={{ fontSize: 34, fontWeight: 700, fontFamily: 'monospace', color, lineHeight: 1 }}>
        {value === null ? '—'
          : isPercent ? `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
          : field === 'transaction_count' ? value.toLocaleString()
          : formatCurrency(value)}
      </span>
      <span style={{ fontSize: 11, color: 'var(--color-text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {METRIC_FIELDS.find((f) => f.value === field)?.label ?? field}
      </span>
    </div>
  )
}

function BarWidget({ widget, filters }: { widget: CanvasWidget; filters: ReturnType<typeof useFilters> }) {
  const { theme } = useTheme()
  const colors = theme === 'dark' ? CHART_COLORS_DARK : CHART_COLORS_LIGHT
  const source = widget.config.source
  const limit = widget.config.limit ?? 10

  const { data: catData = [] } = useQuery({
    queryKey: ['categories', filters.range, filters.institution, filters.account],
    queryFn: () => insightsApi.categories({ range: filters.range, institution: filters.institution, account: filters.account }),
    enabled: source === 'categories',
    staleTime: 30_000,
  })
  const { data: monthlyData = [] } = useQuery({
    queryKey: ['monthly', filters.range, filters.institution, filters.account],
    queryFn: () => insightsApi.monthly({ range: filters.range, institution: filters.institution, account: filters.account }),
    enabled: source === 'monthly',
    staleTime: 30_000,
  })
  const { data: merchantData = [] } = useQuery({
    queryKey: ['merchants', filters.range, filters.institution, filters.account],
    queryFn: () => merchantsApi.list({ range: filters.range, institution: filters.institution, account: filters.account }),
    enabled: source === 'merchants',
    staleTime: 30_000,
  })
  const { data: dowData = [] } = useQuery({
    queryKey: ['dow', filters.range, filters.institution, filters.account],
    queryFn: () => insightsApi.dow({ range: filters.range, institution: filters.institution, account: filters.account }),
    enabled: source === 'dow',
    staleTime: 30_000,
  })

  let chartData: Array<{ name: string; value: number }> = []
  if (source === 'categories') chartData = catData.slice(0, limit).map((d) => ({ name: d.category, value: d.total }))
  if (source === 'monthly')    chartData = monthlyData.slice(-limit).map((d) => ({ name: formatMonth(d.month), value: d.total }))
  if (source === 'merchants')  chartData = merchantData.slice(0, limit).map((d) => ({ name: d.merchant_normalized, value: d.total }))
  if (source === 'dow')        chartData = dowData.map((d) => ({ name: d.day.slice(0, 3), value: d.total }))

  if (!chartData.length) return <EmptyChart label="No data for this period" />

  const maxVal = Math.max(...chartData.map((d) => d.value))
  const yTickFmt = (v: number) => maxVal >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ top: 18, right: 8, left: 0, bottom: 40 }}>
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} angle={-35} textAnchor="end" interval={0} tickFormatter={(v) => truncate(v, 12)} />
        <YAxis tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} tickFormatter={yTickFmt} width={40} axisLine={false} tickLine={false} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--color-border)', opacity: 0.3 }} />
        <Bar dataKey="value" radius={[3, 3, 0, 0]}>
          <LabelList dataKey="value" position="top" formatter={(v: number) => maxVal >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`} style={{ fontSize: 9, fill: 'var(--color-text-muted)' }} />
          {chartData.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function LineWidget({ filters }: { widget: CanvasWidget; filters: ReturnType<typeof useFilters> }) {
  const { theme } = useTheme()
  const color = theme === 'dark' ? CHART_COLORS_DARK[0] : CHART_COLORS_LIGHT[0]

  const { data: monthlyData = [] } = useQuery({
    queryKey: ['monthly', filters.range, filters.institution, filters.account],
    queryFn: () => insightsApi.monthly({ range: filters.range, institution: filters.institution, account: filters.account }),
    staleTime: 30_000,
  })

  const chartData = monthlyData.map((d) => ({ name: formatMonth(d.month), value: d.total }))
  if (!chartData.length) return <EmptyChart label="No data for this period" />
  const maxVal = Math.max(...chartData.map((d) => d.value))

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
        <defs>
          <linearGradient id={`areaGrad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} tickFormatter={(v) => maxVal >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`} width={40} axisLine={false} tickLine={false} />
        <Tooltip content={<ChartTooltip />} />
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#areaGrad-${color.replace('#', '')})`} dot={false} activeDot={{ r: 4, fill: color, stroke: 'var(--color-surface)', strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function PieWidget({ widget, filters }: { widget: CanvasWidget; filters: ReturnType<typeof useFilters> }) {
  const { theme } = useTheme()
  const colors = theme === 'dark' ? CHART_COLORS_DARK : CHART_COLORS_LIGHT
  const source = widget.config.source
  const limit = widget.config.limit ?? 6

  const { data: catData = [] } = useQuery({
    queryKey: ['categories', filters.range, filters.institution, filters.account],
    queryFn: () => insightsApi.categories({ range: filters.range, institution: filters.institution, account: filters.account }),
    enabled: source === 'categories',
    staleTime: 30_000,
  })
  const { data: merchantData = [] } = useQuery({
    queryKey: ['merchants', filters.range, filters.institution, filters.account],
    queryFn: () => merchantsApi.list({ range: filters.range, institution: filters.institution, account: filters.account }),
    enabled: source === 'merchants',
    staleTime: 30_000,
  })

  const rawData = source === 'categories'
    ? catData.slice(0, limit).map((d) => ({ name: d.category, value: d.total }))
    : merchantData.slice(0, limit).map((d) => ({ name: d.merchant_normalized, value: d.total }))

  if (!rawData.length) return <EmptyChart label="No data for this period" />
  const total = rawData.reduce((s, d) => s + d.value, 0)

  return (
    <div className="flex flex-col h-full" style={{ gap: 4 }}>
      <div style={{ flex: '0 0 62%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rawData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius="72%" innerRadius="42%" paddingAngle={2}>
              {rawData.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
            </Pie>
            <Tooltip formatter={(v: number) => [formatCurrency(v), '']} contentStyle={{ background: 'var(--color-surface-raise)', border: '1px solid var(--color-border)', fontSize: 12, borderRadius: 8 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--color-text-muted)' }}>
        Total: <span style={{ color: 'var(--color-text-primary)', fontWeight: 600, fontFamily: 'monospace' }}>{formatCurrency(total)}</span>
      </div>
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 3, padding: '0 4px 4px' }}>
        {rawData.map((d, i) => (
          <div key={d.name} className="flex items-center gap-2" style={{ minWidth: 0 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, flexShrink: 0, background: colors[i % colors.length] }} />
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{truncate(d.name, 20)}</span>
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--color-text-secondary)', flexShrink: 0 }}>{formatCurrency(d.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SankeyWidget({ filters }: { filters: ReturnType<typeof useFilters> }) {
  const { theme } = useTheme()
  const colors = theme === 'dark' ? CHART_COLORS_DARK : CHART_COLORS_LIGHT

  const { data, isLoading } = useQuery({
    queryKey: ['sankey', filters.range, filters.institution, filters.account],
    queryFn: () => canvasApi.sankey({ range: filters.range, institution: filters.institution, account: filters.account }),
    staleTime: 60_000,
  })

  if (isLoading) return <EmptyChart label="Loading…" />
  if (!data || !data.nodes.length) return <EmptyChart label="No flow data for this period" />

  return (
    <ResponsiveContainer width="100%" height="100%">
      <Sankey data={data} nodePadding={14} nodeWidth={10} margin={{ top: 12, right: 100, bottom: 12, left: 8 }} link={{ stroke: colors[1], strokeOpacity: 0.25 }} node={{ fill: colors[0], stroke: 'none' }}>
        <Tooltip formatter={(v: number) => [formatCurrency(v), '']} contentStyle={{ background: 'var(--color-surface-raise)', border: '1px solid var(--color-border)', fontSize: 12, borderRadius: 8 }} />
      </Sankey>
    </ResponsiveContainer>
  )
}

function WidgetContent({ widget, filters }: { widget: CanvasWidget; filters: ReturnType<typeof useFilters> }) {
  switch (widget.type) {
    case 'metric': return <MetricWidget widget={widget} filters={filters} />
    case 'bar':    return <BarWidget    widget={widget} filters={filters} />
    case 'line':   return <LineWidget   widget={widget} filters={filters} />
    case 'pie':    return <PieWidget    widget={widget} filters={filters} />
    case 'sankey': return <SankeyWidget filters={filters} />
    default:       return null
  }
}

// ── Widget config modal ───────────────────────────────────────────────────────

function WidgetModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: Partial<CanvasWidget>
  onSave: (w: Omit<CanvasWidget, 'id'>) => void
  onClose: () => void
}) {
  const isEdit = !!initial?.id
  const [step, setStep] = useState<'type' | 'config'>(isEdit ? 'config' : 'type')
  const [type, setType] = useState<WidgetType>(initial?.type ?? 'bar')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [source, setSource] = useState<WidgetSource>(initial?.config?.source ?? 'categories')
  const [field, setField] = useState(initial?.config?.field ?? 'total_spent')
  const [metric] = useState<'amount' | 'count'>(initial?.config?.metric ?? 'amount')
  const [limit, setLimit] = useState(String(initial?.config?.limit ?? 10))

  const pickType = (t: WidgetType) => {
    setType(t)
    setSource(WIDGET_SOURCES[t][0])
    setTitle(TYPE_META[t].label)
    setStep('config')
  }

  const handleSave = () => {
    onSave({ type, title: title || TYPE_META[type].label, config: { source, field, metric, limit: parseInt(limit) || 10 } })
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)', zIndex: 50 }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rounded-xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', width: 480, maxHeight: '80vh', overflow: 'auto' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {isEdit ? 'Edit widget' : step === 'type' ? 'Add widget' : `Configure ${TYPE_META[type].label}`}
          </span>
          <button onClick={onClose} style={{ color: 'var(--color-text-muted)' }}><X size={16} /></button>
        </div>

        <div className="p-5">
          {step === 'type' && (
            <div className="grid grid-cols-2 gap-3">
              {(Object.keys(TYPE_META) as WidgetType[]).map((t) => {
                const { label, icon: Icon, description } = TYPE_META[t]
                return (
                  <button key={t} onClick={() => pickType(t)} className="rounded-xl text-left"
                    style={{ padding: '14px 16px', border: '1px solid var(--color-border)', background: 'var(--color-surface-raise)', transition: 'border-color 0.15s' }}
                    onMouseOver={(e) => (e.currentTarget.style.borderColor = 'var(--color-accent)')}
                    onMouseOut={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}>
                    <Icon size={18} style={{ color: 'var(--color-accent)', marginBottom: 8 }} />
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{description}</div>
                  </button>
                )
              })}
            </div>
          )}

          {step === 'config' && (
            <div className="space-y-4">
              {!isEdit && <button onClick={() => setStep('type')} style={{ fontSize: 12, color: 'var(--color-accent)' }}>← Change type</button>}
              <div>
                <label style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Title</label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={TYPE_META[type].label} style={{ fontSize: 13, width: '100%' }} autoFocus />
              </div>
              {type !== 'sankey' && type !== 'line' && (
                <div>
                  <label style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Data source</label>
                  <select value={source} onChange={(e) => setSource(e.target.value as WidgetSource)} style={{ fontSize: 13, width: '100%' }}>
                    {WIDGET_SOURCES[type].map((s) => <option key={s} value={s}>{SOURCE_LABELS[s]}</option>)}
                  </select>
                </div>
              )}
              {type === 'metric' && (
                <div>
                  <label style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Metric</label>
                  <select value={field} onChange={(e) => setField(e.target.value)} style={{ fontSize: 13, width: '100%' }}>
                    {METRIC_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
              )}
              {(type === 'bar' || type === 'pie') && source !== 'monthly' && source !== 'dow' && (
                <div>
                  <label style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Show top N</label>
                  <input type="number" value={limit} onChange={(e) => setLimit(e.target.value)} min={3} max={30} style={{ fontSize: 13, width: '100%' }} />
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button onClick={handleSave} className="flex-1 rounded-lg font-medium" style={{ background: 'var(--color-accent)', color: '#fff', padding: '8px 0', fontSize: 13 }}>
                  {isEdit ? 'Update' : 'Add to canvas'}
                </button>
                <button onClick={onClose} className="rounded-lg" style={{ background: 'var(--color-surface-raise)', color: 'var(--color-text-muted)', padding: '8px 16px', fontSize: 13, border: '1px solid var(--color-border)' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Inline name editor ────────────────────────────────────────────────────────

function NameEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setDraft(value) }, [value])

  const commit = () => {
    const trimmed = draft.trim() || 'My Canvas'
    onChange(trimmed)
    setDraft(trimmed)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value); setEditing(false) } }}
        style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)', background: 'transparent', border: 'none', borderBottom: '2px solid var(--color-accent)', outline: 'none', width: Math.max(120, draft.length * 12) }}
        autoFocus
      />
    )
  }

  return (
    <button
      onClick={() => { setDraft(value); setEditing(true) }}
      className="flex items-center gap-2 group"
      style={{ background: 'none', border: 'none', padding: 0, cursor: 'text' }}
    >
      <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)' }}>{value}</span>
      <Pencil size={13} style={{ color: 'var(--color-text-muted)', opacity: 0 }} className="group-hover:opacity-100" />
    </button>
  )
}

// ── Main Canvas page ──────────────────────────────────────────────────────────

export default function Canvas() {
  const filters = useFilters()
  const qc = useQueryClient()
  const [modal, setModal] = useState<'add' | { id: string } | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'error'>('idle')
  const [activeId, setActiveId] = useState<number | null>(null)
  const [canvasName, setCanvasName] = useState('My Canvas')
  const [confirmDelete, setConfirmDelete] = useState<CanvasMeta | null>(null)
  const [layout, setLayout] = useState<CanvasLayoutItem[]>([])
  const [widgets, setWidgets] = useState<Record<string, CanvasWidget>>({})

  // Load canvas list
  const { data: canvasList = [], isLoading: listLoading } = useQuery({
    queryKey: ['canvas-list'],
    queryFn: canvasApi.list,
    staleTime: Infinity,
  })

  // Load active canvas data
  const { data: canvasData } = useQuery({
    queryKey: ['canvas', activeId],
    queryFn: () => canvasApi.load(activeId!),
    enabled: activeId !== null,
    staleTime: Infinity,
  })

  // Auto-select first canvas once list loads
  useEffect(() => {
    if (canvasList.length > 0 && activeId === null) {
      setActiveId(canvasList[0].id)
    }
  }, [canvasList, activeId])

  // Populate local state when canvas data arrives
  useEffect(() => {
    if (canvasData) {
      setCanvasName(canvasData.name)
      setLayout(canvasData.layout)
      setWidgets(canvasData.widgets)
    }
  }, [canvasData])

  // Switch canvas: reset local state then load new canvas
  const switchCanvas = (id: number) => {
    setActiveId(id)
    setLayout([])
    setWidgets({})
    setSaveState('idle')
  }

  const createMutation = useMutation({
    mutationFn: (name: string) => canvasApi.create(name),
    onSuccess: (newCanvas) => {
      qc.invalidateQueries({ queryKey: ['canvas-list'] })
      switchCanvas(newCanvas.id)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => canvasApi.delete(id),
    onSuccess: (_data, deletedId) => {
      qc.invalidateQueries({ queryKey: ['canvas-list'] })
      qc.removeQueries({ queryKey: ['canvas', deletedId] })
      const remaining = canvasList.filter((c) => c.id !== deletedId)
      if (activeId === deletedId) {
        setActiveId(remaining.length > 0 ? remaining[0].id : null)
        setLayout([])
        setWidgets({})
      }
    },
  })

  const saveMutation = useMutation({
    mutationFn: (state: { id: number; name: string; layout: CanvasLayoutItem[]; widgets: Record<string, CanvasWidget> }) =>
      canvasApi.save(state.id, { name: state.name, layout: state.layout, widgets: state.widgets }),
    onSuccess: (_, state) => {
      setSaveState('saved')
      qc.invalidateQueries({ queryKey: ['canvas-list'] })
      qc.setQueryData(['canvas', state.id], { id: state.id, name: state.name, layout: state.layout, widgets: state.widgets })
      setTimeout(() => setSaveState('idle'), 2000)
    },
    onError: () => {
      setSaveState('error')
      setTimeout(() => setSaveState('idle'), 3000)
    },
  })

  const addWidget = useCallback((def: Omit<CanvasWidget, 'id'>) => {
    const id = uid()
    const { w, h } = DEFAULT_SIZES[def.type]
    setLayout((prev) => [...prev, { i: id, x: 0, y: 9999, w, h }])
    setWidgets((prev) => ({ ...prev, [id]: { ...def, id } }))
    setModal(null)
  }, [])

  const updateWidget = useCallback((id: string, def: Omit<CanvasWidget, 'id'>) => {
    setWidgets((prev) => ({ ...prev, [id]: { ...def, id } }))
    setModal(null)
  }, [])

  const removeWidget = useCallback((id: string) => {
    setLayout((prev) => prev.filter((item) => item.i !== id))
    setWidgets((prev) => { const next = { ...prev }; delete next[id]; return next })
  }, [])

  const onLayoutChange = useCallback((newLayout: CanvasLayoutItem[]) => {
    setLayout(newLayout)
  }, [])

  const editingWidget = modal && typeof modal === 'object' ? widgets[modal.id] : undefined

  const saveLabel = saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Failed' : saveMutation.isPending ? 'Saving…' : 'Save'
  const saveBg = saveState === 'saved' ? 'var(--color-positive, #5abf8a)' : saveState === 'error' ? '#e86060' : 'var(--color-surface-raise)'
  const saveColor = saveState !== 'idle' ? '#000' : 'var(--color-text-secondary)'
  const SaveIcon = saveState === 'saved' ? Check : saveState === 'error' ? AlertCircle : Save

  const canCreate = canvasList.length < 3 && !createMutation.isPending

  return (
    <div className="fade-in" style={{ paddingBottom: 32 }}>
      {/* Canvas tabs */}
      <div className="flex items-center gap-1 mb-5" style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 0 }}>
        {canvasList.map((c: CanvasMeta) => (
          <div key={c.id} className="flex items-center group" style={{ position: 'relative' }}>
            <button
              onClick={() => c.id !== activeId && switchCanvas(c.id)}
              style={{
                fontSize: 13,
                fontWeight: c.id === activeId ? 600 : 400,
                color: c.id === activeId ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                padding: '8px 28px 8px 14px',
                background: 'none',
                border: 'none',
                borderBottom: c.id === activeId ? '2px solid var(--color-accent)' : '2px solid transparent',
                marginBottom: -1,
                cursor: c.id === activeId ? 'default' : 'pointer',
                transition: 'color 0.15s',
              }}
            >
              {c.name}
            </button>
            <button
              onClick={() => setConfirmDelete(c)}
              style={{ position: 'absolute', right: 6, color: 'var(--color-text-muted)', lineHeight: 1, opacity: 0.4, transition: 'opacity 0.15s' }}
              className="group-hover:opacity-100"
              title="Delete canvas"
            >
              <X size={11} />
            </button>
          </div>
        ))}
        <button
          onClick={() => canCreate && createMutation.mutate(`Canvas ${canvasList.length + 1}`)}
          disabled={!canCreate}
          title={canvasList.length >= 3 ? 'Maximum 3 canvases' : 'New canvas'}
          style={{ fontSize: 12, color: canCreate ? 'var(--color-accent)' : 'var(--color-text-muted)', padding: '8px 10px', background: 'none', border: 'none', cursor: canCreate ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 4, opacity: canCreate ? 1 : 0.4 }}
        >
          <Plus size={13} /> New
        </button>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          {activeId !== null
            ? <NameEditor value={canvasName} onChange={setCanvasName} />
            : <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)' }}>Canvas</h1>
          }
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>
            Drag to rearrange · resize from corner · click name to rename
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => activeId !== null && saveMutation.mutate({ id: activeId, name: canvasName, layout, widgets })}
            disabled={saveMutation.isPending || activeId === null}
            className="flex items-center gap-2 rounded-lg font-medium"
            style={{ background: saveBg, color: saveColor, border: '1px solid var(--color-border)', padding: '7px 14px', fontSize: 13, transition: 'background 0.2s' }}
          >
            <SaveIcon size={14} />
            {saveLabel}
          </button>
          <button
            onClick={() => setModal('add')}
            disabled={activeId === null}
            className="flex items-center gap-2 rounded-lg font-medium"
            style={{ background: 'var(--color-accent)', color: '#fff', padding: '7px 14px', fontSize: 13, opacity: activeId === null ? 0.5 : 1 }}
          >
            <Plus size={14} />
            Add widget
          </button>
        </div>
      </div>

      {/* Loading / empty states */}
      {listLoading && (
        <div className="flex items-center justify-center" style={{ height: 200, color: 'var(--color-text-muted)', fontSize: 13 }}>
          Loading…
        </div>
      )}

      {!listLoading && canvasList.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl" style={{ height: 320, border: '2px dashed var(--color-border)', color: 'var(--color-text-muted)' }}>
          <BarChart2 size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
          <p style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>No canvases yet</p>
          <p style={{ fontSize: 12, marginBottom: 16 }}>Create your first canvas to start building visualizations</p>
          <button
            onClick={() => createMutation.mutate('My Canvas')}
            className="flex items-center gap-2 rounded-lg font-medium"
            style={{ background: 'var(--color-accent)', color: '#fff', padding: '8px 16px', fontSize: 13 }}
          >
            <Plus size={14} /> Create canvas
          </button>
        </div>
      )}

      {!listLoading && activeId !== null && layout.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl" style={{ height: 280, border: '2px dashed var(--color-border)', color: 'var(--color-text-muted)' }}>
          <BarChart2 size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
          <p style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>This canvas is empty</p>
          <p style={{ fontSize: 12, marginBottom: 16 }}>Add widgets to start building your custom view</p>
          <button onClick={() => setModal('add')} className="flex items-center gap-2 rounded-lg font-medium" style={{ background: 'var(--color-accent)', color: '#fff', padding: '8px 16px', fontSize: 13 }}>
            <Plus size={14} /> Add first widget
          </button>
        </div>
      )}

      {/* Grid */}
      {activeId !== null && layout.length > 0 && (
        <ResponsiveGridLayout
          className="layout"
          layouts={{ lg: layout }}
          breakpoints={{ lg: 1200, md: 900, sm: 600 }}
          cols={{ lg: 12, md: 10, sm: 6 }}
          rowHeight={60}
          onLayoutChange={(l) => onLayoutChange(l as CanvasLayoutItem[])}
          draggableHandle=".drag-handle"
          margin={[12, 12]}
        >
          {layout.map((item) => {
            const widget = widgets[item.i]
            if (!widget) return null
            return (
              <div key={item.i}>
                <div className="flex flex-col h-full rounded-xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
                  <div className="flex items-center gap-2 flex-shrink-0 drag-handle" style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border)', cursor: 'grab', userSelect: 'none' }}>
                    <GripVertical size={13} style={{ color: 'var(--color-border)', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{widget.title}</span>
                    <button onClick={() => setModal({ id: item.i })} style={{ color: 'var(--color-text-muted)', lineHeight: 1, flexShrink: 0 }}><Settings2 size={12} /></button>
                    <button onClick={() => removeWidget(item.i)} style={{ color: 'var(--color-text-muted)', lineHeight: 1, flexShrink: 0 }}><X size={12} /></button>
                  </div>
                  <div className="flex-1 min-h-0" style={{ padding: widget.type === 'metric' ? 16 : '8px 4px 4px' }}>
                    <WidgetContent widget={widget} filters={filters} />
                  </div>
                </div>
              </div>
            )
          })}
        </ResponsiveGridLayout>
      )}

      {modal === 'add' && <WidgetModal onSave={addWidget} onClose={() => setModal(null)} />}
      {modal && typeof modal === 'object' && editingWidget && (
        <WidgetModal initial={editingWidget} onSave={(def) => updateWidget(modal.id, def)} onClose={() => setModal(null)} />
      )}

      {/* Delete canvas confirmation */}
      {confirmDelete && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.5)', zIndex: 50 }}
          onClick={(e) => e.target === e.currentTarget && setConfirmDelete(null)}
        >
          <div className="rounded-xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', width: 360, padding: 24 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 8 }}>
              Delete canvas?
            </h2>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 20 }}>
              <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>"{confirmDelete.name}"</span> and all its widgets will be permanently deleted.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                className="rounded-lg"
                style={{ background: 'var(--color-surface-raise)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)', padding: '7px 16px', fontSize: 13 }}
              >
                Cancel
              </button>
              <button
                onClick={() => { deleteMutation.mutate(confirmDelete.id); setConfirmDelete(null) }}
                className="rounded-lg font-medium"
                style={{ background: '#e86060', color: '#fff', padding: '7px 16px', fontSize: 13 }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
