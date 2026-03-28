import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { merchantsApi } from '../lib/api'
import { useFilters } from '../context/FilterContext'
import { useTheme } from '../context/ThemeContext'
import { formatCurrency, formatDate, CHART_COLORS_DARK, CHART_COLORS_LIGHT } from '../lib/utils'
import Card from '../components/Card'
import Spinner from '../components/Spinner'
import SkeletonRow from '../components/SkeletonRow'

function MerchantTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { merchant_normalized: string; total: number; count: number } }> }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div
      className="rounded-lg px-3 py-2"
      style={{ background: 'var(--color-surface-raise)', border: '1px solid var(--color-border)', fontSize: 12 }}
    >
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: 2 }}>{d.merchant_normalized}</p>
      <p style={{ color: 'var(--color-text-primary)', fontFamily: 'monospace', fontWeight: 600 }}>
        {formatCurrency(d.total)}
      </p>
      <p style={{ color: 'var(--color-text-muted)' }}>{d.count} visits</p>
    </div>
  )
}

export default function Merchants() {
  const { range, institution, account } = useFilters()
  const { theme } = useTheme()
  const chartColors = theme === 'dark' ? CHART_COLORS_DARK : CHART_COLORS_LIGHT
  const [selectedMerchant, setSelectedMerchant] = useState<string>('')
  const params = { range, institution, account }

  const { data: merchants = [], isLoading } = useQuery({
    queryKey: ['merchants', range, institution, account],
    queryFn: () => merchantsApi.list(params),
  })

  const { data: merchantDetail = [], isLoading: loadingDetail } = useQuery({
    queryKey: ['merchant-detail', selectedMerchant, range, institution, account],
    queryFn: () => merchantsApi.detail(selectedMerchant, params),
    enabled: !!selectedMerchant,
  })

  const top15 = merchants.slice(0, 15)

  return (
    <div className="space-y-5 fade-in">
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)' }}>Merchants</h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>
          Spending by merchant
        </p>
      </div>

      {/* Bar chart */}
      <Card>
        <p className="mb-4" style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          Top 15 Merchants
        </p>
        {isLoading ? (
          <div className="flex items-center justify-center" style={{ height: 400 }}>
            <Spinner />
          </div>
        ) : top15.length === 0 ? (
          <div className="flex items-center justify-center" style={{ height: 200 }}>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No data</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(300, top15.length * 36)}>
            <BarChart
              data={top15}
              layout="vertical"
              margin={{ left: 0, right: 20, top: 0, bottom: 0 }}
            >
              <XAxis
                type="number"
                tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              />
              <YAxis
                type="category"
                dataKey="merchant_normalized"
                tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={160}
              />
              <Tooltip content={<MerchantTooltip />} cursor={{ fill: 'var(--color-surface-raise)' }} />
              <Bar dataKey="total" radius={[0, 3, 3, 0]}>
                {top15.map((_, i) => (
                  <Cell
                    key={i}
                    fill={chartColors[i % chartColors.length]}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedMerchant(top15[i].merchant_normalized)}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Merchant selector */}
      <div className="flex items-center gap-3">
        <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
          Drill-down:
        </label>
        <select
          value={selectedMerchant}
          onChange={(e) => setSelectedMerchant(e.target.value)}
          style={{ minWidth: 200 }}
        >
          <option value="">Select merchant…</option>
          {merchants.map((m) => (
            <option key={m.merchant_normalized} value={m.merchant_normalized}>
              {m.merchant_normalized} ({m.count})
            </option>
          ))}
        </select>
        {selectedMerchant && (
          <button
            onClick={() => setSelectedMerchant('')}
            style={{ fontSize: 12, color: 'var(--color-text-muted)' }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Detail table */}
      {selectedMerchant && (
        <div
          className="rounded-xl overflow-hidden fade-in"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <div
            className="px-4 py-3"
            style={{ borderBottom: '1px solid var(--color-border)' }}
          >
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
              {selectedMerchant}
            </p>
            {!loadingDetail && (
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                {merchantDetail.length} transactions · {formatCurrency(merchantDetail.reduce((s, t) => s + t.amount, 0))} total
              </p>
            )}
          </div>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Name</th>
                  <th>Category</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th>Institution</th>
                </tr>
              </thead>
              <tbody>
                {loadingDetail ? (
                  <SkeletonRow cols={5} rows={6} />
                ) : merchantDetail.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '24px 0' }}>
                      No transactions
                    </td>
                  </tr>
                ) : (
                  merchantDetail.map((tx) => (
                    <tr key={tx.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                        {formatDate(tx.date)}
                      </td>
                      <td style={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tx.name}
                      </td>
                      <td>
                        <span
                          className="px-2 py-0.5 rounded-full text-xs"
                          style={{ background: 'var(--color-surface-raise)', color: 'var(--color-text-secondary)', fontSize: 11 }}
                        >
                          {tx.category}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>
                        <span style={{ color: tx.amount < 0 ? 'var(--color-positive)' : 'var(--color-text-primary)' }}>
                          {formatCurrency(tx.amount)}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                        {tx.institution}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
