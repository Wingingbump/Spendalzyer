import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Check, ChevronUp, ChevronDown } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { transactionsApi, categoriesApi, workspaceApi, merchantsApi } from '../lib/api'
import type { Transaction } from '../lib/api'
import { useFilters } from '../context/FilterContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { useTheme } from '../context/ThemeContext'
import { usePanel } from '../context/PanelContext'
import { PANEL_WIDTH } from '../components/RightPanel'
import { formatCurrency, formatDate, CHART_COLORS_DARK, CHART_COLORS_LIGHT } from '../lib/utils'
import SkeletonRow from '../components/SkeletonRow'
import { ActiveGroupBanner } from '../components/RightPanel'

const CATEGORIES = [
  'Food & Drink', 'Groceries', 'Shopping', 'Transportation', 'Entertainment',
  'Bills & Utilities', 'Health & Fitness', 'Travel', 'Personal Care',
  'Home', 'Education', 'Business Services', 'Income', 'Transfer', 'Other',
]

interface EditState {
  [id: number]: {
    category?: string
    amount?: string
    notes?: string
  }
}

interface SavedState {
  [id: number]: boolean
}

export default function Transactions() {
  const { range, institution, account } = useFilters()
  const { activeGroup } = useWorkspace()
  const { theme } = useTheme()
  const { panelOpen } = usePanel()
  const rhsWidth = panelOpen ? PANEL_WIDTH : 0
  const [search, setSearch] = useState('')
  const [editState, setEditState] = useState<EditState>({})
  const [saved, setSaved] = useState<SavedState>({})
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingMerchant, setEditingMerchant] = useState<number | null>(null)
  const [merchantDraft, setMerchantDraft] = useState('')
  const qc = useQueryClient()
  const chartColors = theme === 'dark' ? CHART_COLORS_DARK : CHART_COLORS_LIGHT

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['transactions', range, institution, account, search],
    queryFn: () => transactionsApi.list({ range, institution, account, search }),
  })

  const { data: categoryMappings = [] } = useQuery({
    queryKey: ['category-mappings'],
    queryFn: () => categoriesApi.mappings(),
    staleTime: 300_000,
  })

  // Collect all known categories
  const allCategories = Array.from(new Set([
    ...CATEGORIES,
    ...categoryMappings.map((m) => m.internal_category),
    ...transactions.map((t) => t.category).filter(Boolean),
  ])).sort()

  const patchMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { category?: string; amount?: number; notes?: string } }) =>
      transactionsApi.patch(id, data),
    onSuccess: (_, { id }) => {
      setSaved((s) => ({ ...s, [id]: true }))
      setTimeout(() => setSaved((s) => ({ ...s, [id]: false })), 1500)
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['summary'] })
      qc.invalidateQueries({ queryKey: ['monthly'] })
      qc.invalidateQueries({ queryKey: ['categories'] })
    },
  })


  const renameMerchantMutation = useMutation({
    mutationFn: ({ rawName, displayName }: { rawName: string; displayName: string }) =>
      merchantsApi.saveOverride(rawName, displayName),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['merchants'] })
    },
  })

  const commitMerchant = (rawName: string) => {
    const trimmed = merchantDraft.trim()
    if (trimmed && trimmed !== rawName) renameMerchantMutation.mutate({ rawName, displayName: trimmed })
    setEditingMerchant(null)
  }

  const handleBlur = (tx: Transaction, field: 'category' | 'amount' | 'notes') => {
    const edit = editState[tx.id]
    if (!edit) return
    const value = edit[field]
    if (value === undefined) return

    const patch: { category?: string; amount?: number; notes?: string } = {}
    if (field === 'category' && value !== tx.category) patch.category = value
    if (field === 'amount') {
      const numVal = parseFloat(value as string)
      if (!isNaN(numVal) && numVal !== tx.amount) patch.amount = numVal
    }
    if (field === 'notes' && value !== tx.notes) patch.notes = value as string

    if (Object.keys(patch).length > 0) {
      patchMutation.mutate({ id: tx.id, data: patch })
    }
  }

  const setEdit = (id: number, field: 'category' | 'amount' | 'notes', value: string) => {
    setEditState((s) => ({ ...s, [id]: { ...s[id], [field]: value } }))
  }

  const { data: groupTxData } = useQuery({
    queryKey: ['group-tx-ids', activeGroup?.id],
    queryFn: () => workspaceApi.groupTransactions(activeGroup!.id),
    enabled: !!activeGroup,
  })

  const groupTxIds = new Set((groupTxData?.transaction_ids ?? []).map(String))

  const tagMutation = useMutation({
    mutationFn: ({ txId, inGroup }: { txId: string; inGroup: boolean }) =>
      inGroup
        ? workspaceApi.removeTransaction(activeGroup!.id, txId)
        : workspaceApi.addTransaction(activeGroup!.id, txId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['group-tx-ids', activeGroup?.id] })
      qc.invalidateQueries({ queryKey: ['groups'] })
    },
  })

  const total = transactions.reduce((s, t) => s + t.amount, 0)
  const avg = transactions.length > 0 ? total / transactions.length : 0
  const largest = transactions.length > 0 ? Math.max(...transactions.map((t) => t.amount)) : 0

  // Drawer data — derived from loaded transactions, no extra fetch needed
  const categoryData = Object.entries(
    transactions.reduce((acc, t) => {
      if (t.amount <= 0) return acc
      const cat = t.category || 'Uncategorized'
      acc[cat] = (acc[cat] || 0) + t.amount
      return acc
    }, {} as Record<string, number>)
  )
    .map(([category, value]) => ({ category, value }))
    .sort((a, b) => b.value - a.value)

  const merchantData = Object.entries(
    transactions.reduce((acc, t) => {
      if (t.amount <= 0) return acc
      const m = t.merchant_normalized || t.name
      if (!acc[m]) acc[m] = { total: 0, count: 0 }
      acc[m].total += t.amount
      acc[m].count += 1
      return acc
    }, {} as Record<string, { total: number; count: number }>)
  )
    .map(([name, { total: mTotal, count }]) => ({ name, total: mTotal, count }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)

  return (
    <div className="space-y-4 fade-in" style={{ paddingBottom: drawerOpen ? 'calc(45vh + 56px)' : 56, transition: 'padding-bottom 0.25s ease' }}>
      <ActiveGroupBanner />
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)' }}>Transactions</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>
            Click fields to edit
          </p>
        </div>
        <div className="relative">
          <Search
            size={14}
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }}
          />
          <input
            type="search"
            placeholder="Search transactions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 30, width: 240 }}
          />
        </div>
      </div>

      <div
        className="rounded-xl"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Name</th>
                <th>Merchant</th>
                <th>Category</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th>Institution</th>
                <th>Notes</th>
                <th style={{ width: 30 }}></th>
                {activeGroup && <th style={{ width: 28 }}></th>}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <SkeletonRow cols={activeGroup ? 9 : 8} rows={10} />
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '32px 0' }}>
                    No transactions found
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => {
                  const isEditingAmount = editState[tx.id]?.amount !== undefined
                  const currentAmount = isEditingAmount
                    ? editState[tx.id].amount!
                    : formatCurrency(tx.amount)
                  const currentCategory = editState[tx.id]?.category !== undefined
                    ? editState[tx.id].category!
                    : tx.category
                  const currentNotes = editState[tx.id]?.notes !== undefined
                    ? editState[tx.id].notes!
                    : (tx.notes ?? '')

                  return (
                    <tr key={tx.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                        {formatDate(tx.date)}
                      </td>
                      <td>
                        <span style={{ fontSize: 12, maxWidth: 160, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {tx.name}
                        </span>
                      </td>
                      <td className="editable-cell">
                        {editingMerchant === tx.id ? (
                          <input
                            type="text"
                            value={merchantDraft}
                            autoFocus
                            onChange={(e) => setMerchantDraft(e.target.value)}
                            onBlur={() => commitMerchant(tx.merchant_normalized || '')}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitMerchant(tx.merchant_normalized || '')
                              if (e.key === 'Escape') setEditingMerchant(null)
                            }}
                            style={{ fontSize: 12, width: 130 }}
                          />
                        ) : (
                          <span
                            onDoubleClick={() => { setMerchantDraft(tx.merchant_normalized || ''); setEditingMerchant(tx.id) }}
                            title="Double-click to rename"
                            style={{ fontSize: 12, color: 'var(--color-text-secondary)', maxWidth: 140, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text' }}
                          >
                            {tx.merchant_normalized || '—'}
                          </span>
                        )}
                      </td>
                      <td className="editable-cell">
                        <select
                          value={currentCategory}
                          onChange={(e) => {
                            setEdit(tx.id, 'category', e.target.value)
                            // Auto-save on change for select
                            patchMutation.mutate({ id: tx.id, data: { category: e.target.value } })
                          }}
                          style={{ fontSize: 12, minWidth: 140, border: 'none', background: 'var(--color-surface)', color: 'var(--color-text-primary)', padding: '2px 24px 2px 4px' }}
                        >
                          {allCategories.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                          {!allCategories.includes(currentCategory) && currentCategory && (
                            <option value={currentCategory}>{currentCategory}</option>
                          )}
                        </select>
                      </td>
                      <td style={{ textAlign: 'right' }} className="editable-cell">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={currentAmount}
                          onFocus={() => {
                            if (!isEditingAmount) setEdit(tx.id, 'amount', tx.amount.toString())
                          }}
                          onChange={(e) => setEdit(tx.id, 'amount', e.target.value)}
                          onBlur={() => {
                            handleBlur(tx, 'amount')
                            // Revert to formatted display after blur
                            setEditState((s) => {
                              const next = { ...s }
                              if (next[tx.id]) {
                                const { amount: _a, ...rest } = next[tx.id]
                                if (Object.keys(rest).length === 0) delete next[tx.id]
                                else next[tx.id] = rest
                              }
                              return next
                            })
                          }}
                          style={{
                            fontFamily: 'monospace',
                            fontSize: 12,
                            textAlign: 'right',
                            width: 90,
                            color: tx.amount < 0 ? 'var(--color-positive)' : 'var(--color-text-primary)',
                          }}
                        />
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                        {tx.institution}
                      </td>
                      <td className="editable-cell">
                        <input
                          type="text"
                          value={currentNotes}
                          placeholder="Add note…"
                          onChange={(e) => setEdit(tx.id, 'notes', e.target.value)}
                          onBlur={() => handleBlur(tx, 'notes')}
                          style={{ fontSize: 12, minWidth: 120 }}
                        />
                      </td>
                      <td>
                        {saved[tx.id] && (
                          <Check size={13} style={{ color: 'var(--color-positive)' }} />
                        )}
                        {tx.has_user_override && !saved[tx.id] && (
                          <div
                            title="Has overrides"
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: 'var(--color-accent)',
                              margin: '0 auto',
                            }}
                          />
                        )}
                      </td>
                      {activeGroup && (() => {
                        const txId = String(tx.id)
                        const inGroup = groupTxIds.has(txId)
                        return (
                          <td>
                            <button
                              onClick={() => tagMutation.mutate({ txId, inGroup })}
                              title={inGroup ? `Remove from ${activeGroup.name}` : `Add to ${activeGroup.name}`}
                              style={{
                                width: 16,
                                height: 16,
                                borderRadius: '50%',
                                background: inGroup ? activeGroup.color : 'transparent',
                                border: `2px solid ${inGroup ? activeGroup.color : 'var(--color-border)'}`,
                                display: 'block',
                                cursor: 'pointer',
                                transition: 'background 0.15s, border-color 0.15s',
                              }}
                            />
                          </td>
                        )
                      })()}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

      </div>

      {/* Slide-up drawer */}
      <div
        style={{
          position: 'fixed',
          bottom: 56,
          left: 220,
          right: rhsWidth,
          height: drawerOpen ? '45vh' : 0,
          overflow: 'hidden',
          transition: 'height 0.25s ease',
          background: 'var(--color-surface)',
          borderTop: drawerOpen ? '1px solid var(--color-border)' : 'none',
          zIndex: 9,
        }}
      >
        <div className="flex h-full gap-0" style={{ overflow: 'hidden' }}>
          {/* Categories pie */}
          <div className="flex flex-col flex-1 p-5" style={{ borderRight: '1px solid var(--color-border)', overflow: 'hidden' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, flexShrink: 0 }}>
              By Category
            </p>
            <div className="flex flex-1 gap-4 min-h-0">
              <ResponsiveContainer width="55%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    dataKey="value"
                    nameKey="category"
                    cx="50%" cy="50%"
                    innerRadius="40%" outerRadius="70%"
                    paddingAngle={2}
                  >
                    {categoryData.map((_, i) => (
                      <Cell key={i} fill={chartColors[i % chartColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => formatCurrency(v)}
                    contentStyle={{ background: 'var(--color-surface-raise)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-1.5 justify-center overflow-y-auto" style={{ flex: 1 }}>
                {categoryData.slice(0, 7).map((c, i) => (
                  <div key={c.category} className="flex items-center gap-2 min-w-0">
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: chartColors[i % chartColors.length], flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.category}</span>
                    <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--color-text-muted)', flexShrink: 0 }}>{formatCurrency(c.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top merchants */}
          <div className="flex flex-col flex-1 p-5" style={{ overflow: 'hidden' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, flexShrink: 0 }}>
              Top Merchants
            </p>
            <div className="flex flex-col gap-2 overflow-y-auto flex-1">
              {merchantData.map((m, i) => {
                const pct = total > 0 ? (m.total / total) * 100 : 0
                return (
                  <div key={m.name}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: chartColors[i % chartColors.length], flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                      </div>
                      <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--color-text-primary)', flexShrink: 0, marginLeft: 8 }}>{formatCurrency(m.total)}</span>
                    </div>
                    <div style={{ height: 3, borderRadius: 2, background: 'var(--color-border)' }}>
                      <div style={{ height: 3, borderRadius: 2, width: `${pct}%`, background: chartColors[i % chartColors.length], transition: 'width 0.3s' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div
        className="flex items-center gap-8 px-6"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 220,
          right: rhsWidth,
          height: 56,
          borderTop: '1px solid var(--color-border)',
          background: 'var(--color-surface-raise)',
          zIndex: 10,
        }}
      >
        <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          {transactions.length} transactions
        </span>
        <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          Total <span style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 600, color: 'var(--color-negative)', marginLeft: 6 }}>{formatCurrency(total)}</span>
        </span>
        <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          Avg <span style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', marginLeft: 6 }}>{formatCurrency(avg)}</span>
        </span>
        <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          Largest <span style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', marginLeft: 6 }}>{formatCurrency(largest)}</span>
        </span>
        <button
          onClick={() => setDrawerOpen((o) => !o)}
          className="ml-auto flex items-center gap-1.5"
          style={{ fontSize: 12, color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
        >
          {drawerOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          {drawerOpen ? 'Hide' : 'Insights'}
        </button>
      </div>
    </div>
  )
}
