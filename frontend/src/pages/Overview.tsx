
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { ShoppingBag, Store, Calendar } from 'lucide-react'
import { insightsApi } from '../lib/api'
import { useFilters } from '../context/FilterContext'
import { useTheme } from '../context/ThemeContext'
import { formatCurrency, formatMonth, CHART_COLORS_DARK, CHART_COLORS_LIGHT } from '../lib/utils'
import Card from '../components/Card'
import MetricCard from '../components/MetricCard'
import Spinner from '../components/Spinner'

// Custom tooltip for bar chart
function MonthlyTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-lg px-3 py-2"
      style={{ background: 'var(--color-surface-raise)', border: '1px solid var(--color-border)', fontSize: 12 }}
    >
      <p style={{ color: 'var(--color-text-muted)', marginBottom: 2 }}>{label}</p>
      <p style={{ color: 'var(--color-text-primary)', fontFamily: 'monospace', fontWeight: 600 }}>
        {formatCurrency(payload[0].value)}
      </p>
    </div>
  )
}

function DowTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-lg px-3 py-2"
      style={{ background: 'var(--color-surface-raise)', border: '1px solid var(--color-border)', fontSize: 12 }}
    >
      <p style={{ color: 'var(--color-text-muted)', marginBottom: 2 }}>{label}</p>
      <p style={{ color: 'var(--color-text-primary)', fontFamily: 'monospace', fontWeight: 600 }}>
        {formatCurrency(payload[0].value)}
      </p>
    </div>
  )
}


export default function Overview() {
  const { range, institution, account } = useFilters()
  const { theme } = useTheme()
  const chartColors = theme === 'dark' ? CHART_COLORS_DARK : CHART_COLORS_LIGHT
  const params = { range, institution, account }

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['summary', range, institution, account],
    queryFn: () => insightsApi.summary(params),
  })

  const { data: monthly = [], isLoading: loadingMonthly } = useQuery({
    queryKey: ['monthly', range, institution, account],
    queryFn: () => insightsApi.monthly(params),
  })

  const { data: categories = [], isLoading: loadingCategories } = useQuery({
    queryKey: ['categories', range, institution, account],
    queryFn: () => insightsApi.categories(params),
  })

  const { data: dow = [], isLoading: loadingDow } = useQuery({
    queryKey: ['dow', range, institution, account],
    queryFn: () => insightsApi.dow(params),
  })

  const delta = summary?.delta ?? 0
  const deltaPct = summary?.delta_pct ?? 0
  const isPositiveDelta = delta <= 0

  return (
    <div className="space-y-5 fade-in">
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)' }}>Overview</h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>
          Your spending summary
        </p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-3 gap-4">
        <MetricCard
          label="Total Spent"
          value={formatCurrency(summary?.total_spent ?? 0)}
          isLoading={loadingSummary}
        />
        <MetricCard
          label="This Month"
          value={formatCurrency(summary?.this_month ?? 0)}
          sub={
            summary
              ? `${isPositiveDelta ? '↓' : '↑'} ${formatCurrency(Math.abs(delta))} vs last month (${Math.abs(deltaPct).toFixed(1)}%)`
              : undefined
          }
          subPositive={isPositiveDelta}
          isLoading={loadingSummary}
          hero
        />
        <MetricCard
          label="Transactions"
          value={String(summary?.transaction_count ?? 0)}
          sub={summary ? `Net: ${formatCurrency(summary.net_spend)}` : undefined}
          isLoading={loadingSummary}
        />
      </div>

      {/* Monthly Chart */}
      <Card>
        <p className="mb-4" style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          Monthly Spending
        </p>
        {loadingMonthly ? (
          <div className="flex items-center justify-center" style={{ height: 200 }}>
            <Spinner />
          </div>
        ) : monthly.length === 0 ? (
          <div className="flex items-center justify-center" style={{ height: 200 }}>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No data</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthly.map((m) => ({ ...m, label: formatMonth(m.month) }))}>
              <XAxis
                dataKey="label"
                tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                width={45}
              />
              <Tooltip content={<MonthlyTooltip />} cursor={{ fill: 'var(--color-surface-raise)' }} />
              <Bar dataKey="total" fill={chartColors[0]} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Category + DOW charts */}
      <div className="grid grid-cols-2 gap-4">
        {/* Categories */}
        <Card>
          <p className="mb-4" style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
            By Category
          </p>
          {loadingCategories ? (
            <div className="flex items-center justify-center" style={{ height: 200 }}>
              <Spinner />
            </div>
          ) : categories.length === 0 ? (
            <div className="flex items-center justify-center" style={{ height: 200 }}>
              <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No data</p>
            </div>
          ) : (
            <div className="space-y-2">
              {categories.slice(0, 8).map((cat, i) => (
                <div key={cat.category}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }} className="truncate max-w-32">
                      {cat.category}
                    </span>
                    <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--color-text-primary)' }}>
                      {formatCurrency(cat.total)}
                    </span>
                  </div>
                  <div className="rounded-full overflow-hidden" style={{ height: 6, background: 'var(--color-surface-raise)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${cat.pct}%`, background: chartColors[i % chartColors.length] }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Day of Week */}
        <Card>
          <p className="mb-4" style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
            Day of Week
          </p>
          {loadingDow ? (
            <div className="flex items-center justify-center" style={{ height: 200 }}>
              <Spinner />
            </div>
          ) : dow.length === 0 ? (
            <div className="flex items-center justify-center" style={{ height: 200 }}>
              <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No data</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dow}>
                <XAxis
                  dataKey="day"
                  tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  width={40}
                />
                <Tooltip content={<DowTooltip />} cursor={{ fill: 'var(--color-surface-raise)' }} />
                <Bar dataKey="total" fill={chartColors[1]} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Highlight Cards */}
      <div className="grid grid-cols-3 gap-4">
        {/* Biggest Purchase */}
        <Card>
          <div className="flex items-start gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(200, 255, 0, 0.12)' }}
            >
              <ShoppingBag size={15} style={{ color: 'var(--color-accent)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Biggest Purchase
              </p>
              {loadingSummary ? (
                <div className="skeleton mt-2" style={{ height: 20, width: 100 }} />
              ) : summary?.biggest_purchase ? (
                <>
                  <p style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: 'var(--color-text-primary)', marginTop: 4 }}>
                    {formatCurrency(summary.biggest_purchase.amount)}
                  </p>
                  <p className="truncate mt-0.5" style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    {summary.biggest_purchase.name}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                    {summary.biggest_purchase.date}
                  </p>
                </>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>—</p>
              )}
            </div>
          </div>
        </Card>

        {/* Most Visited Merchant */}
        <Card>
          <div className="flex items-start gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(90, 191, 138, 0.12)' }}
            >
              <Store size={15} style={{ color: 'var(--color-positive)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Most Visited
              </p>
              {loadingSummary ? (
                <div className="skeleton mt-2" style={{ height: 20, width: 100 }} />
              ) : summary?.most_visited_merchant ? (
                <>
                  <p className="truncate mt-1" style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                    {summary.most_visited_merchant.merchant}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                    {summary.most_visited_merchant.count} visits · {formatCurrency(summary.most_visited_merchant.total)}
                  </p>
                </>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>—</p>
              )}
            </div>
          </div>
        </Card>

        {/* Biggest Spending Day */}
        <Card>
          <div className="flex items-start gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(232, 96, 96, 0.12)' }}
            >
              <Calendar size={15} style={{ color: 'var(--color-negative)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Biggest Day
              </p>
              {loadingSummary ? (
                <div className="skeleton mt-2" style={{ height: 20, width: 100 }} />
              ) : summary?.biggest_spending_day ? (
                <>
                  <p style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: 'var(--color-text-primary)', marginTop: 4 }}>
                    {formatCurrency(summary.biggest_spending_day.total)}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                    {summary.biggest_spending_day.date}
                  </p>
                </>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>—</p>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
