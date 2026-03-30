import React, { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Trash2, X, ChevronRight, ChevronLeft,
  Layers, Target, RefreshCw, Clock, BarChart2,
} from 'lucide-react'
import { workspaceApi, transactionsApi, insightsApi } from '../lib/api'
import type { CustomGroup } from '../lib/api'
import { useWorkspace } from '../context/WorkspaceContext'
import { useFilters } from '../context/FilterContext'
import { formatCurrency, formatDate, CHART_COLORS_DARK } from '../lib/utils'

export const PANEL_WIDTH = 300

// ── Tab config ────────────────────────────────────────────────────────────────

type TabId = 'recent' | 'insights' | 'budgets' | 'recurring' | 'groups'

const ROUTE_TABS: Record<string, TabId[]> = {
  '/overview':     ['recent',   'budgets',   'recurring'],
  '/transactions': ['insights', 'groups',    'budgets'],
  '/ledger':       ['recurring','budgets',   'groups'],
  '/categories':   ['budgets',  'recurring', 'groups'],
  '/merchants':    ['budgets',  'recurring', 'groups'],
  '/canvas':       ['groups',   'budgets',   'recurring'],
  '/settings':     ['budgets',  'recurring', 'groups'],
}
const DEFAULT_TABS: TabId[] = ['budgets', 'recurring', 'groups']

const TAB_LABEL: Record<TabId, string> = {
  recent:   'Recent',
  insights: 'Insights',
  budgets:  'Budgets',
  recurring:'Recurring',
  groups:   'Groups',
}

const CATEGORIES = [
  'Food & Drink', 'Groceries', 'Shopping', 'Transportation', 'Entertainment',
  'Bills & Utilities', 'Health & Fitness', 'Travel', 'Personal Care',
  'Home', 'Education', 'Business Services', 'Income', 'Transfer', 'Other',
]

const GROUP_COLORS = ['#b5c4ff', '#5abf8a', '#7aaed4', '#e8c17a', '#c47adb', '#e86060']

const FREQ_LABEL: Record<string, string> = {
  weekly: 'weekly', biweekly: 'bi-wk', monthly: 'monthly',
  quarterly: 'qtrly', annual: 'annual',
}

// ── Shared ────────────────────────────────────────────────────────────────────

function ProgressBar({ value, max, color }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  const over = value > max
  const barColor = color ?? (over ? 'var(--color-negative)' : pct > 80 ? '#e8c17a' : 'var(--color-accent)')
  return (
    <div style={{ height: 4, borderRadius: 2, background: 'var(--color-border)' }}>
      <div style={{ height: 4, borderRadius: 2, width: `${pct}%`, background: barColor, transition: 'width 0.3s' }} />
    </div>
  )
}

// ── Recent tab ────────────────────────────────────────────────────────────────

function RecentTab() {
  const { range, institution, account } = useFilters()
  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['transactions', range, institution, account, ''],
    queryFn: () => transactionsApi.list({ range, institution, account, search: '' }),
    select: (data) => data.slice(0, 5),
  })

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="skeleton rounded-lg" style={{ height: 52 }} />
        ))}
      </div>
    )
  }

  if (transactions.length === 0) {
    return <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>No transactions in range.</p>
  }

  return (
    <div className="space-y-1">
      {transactions.map((tx) => (
        <div
          key={tx.id}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5"
          style={{ background: 'var(--color-surface-raise)' }}
        >
          <div className="flex-1 min-w-0">
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }} className="truncate">
              {tx.merchant_normalized || tx.name}
            </p>
            <p style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 1 }}>
              {formatDate(tx.date)} · {tx.category}
            </p>
          </div>
          <span
            style={{
              fontSize: 12,
              fontFamily: 'monospace',
              fontWeight: 600,
              color: tx.amount < 0 ? 'var(--color-positive)' : 'var(--color-text-primary)',
              flexShrink: 0,
            }}
          >
            {formatCurrency(tx.amount)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Insights tab ──────────────────────────────────────────────────────────────

function InsightsTab() {
  const { range, institution, account } = useFilters()
  const params = { range, institution, account }

  const { data: categories = [], isLoading: loadingCat } = useQuery({
    queryKey: ['categories', range, institution, account],
    queryFn: () => insightsApi.categories(params),
  })

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['summary', range, institution, account],
    queryFn: () => insightsApi.summary(params),
  })

  const top5 = categories.slice(0, 5)

  return (
    <div className="space-y-5">
      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'Total', value: summary?.total_spent, loading: loadingSummary },
          { label: 'This Month', value: summary?.this_month, loading: loadingSummary },
        ].map(({ label, value, loading }) => (
          <div key={label} className="rounded-lg p-3" style={{ background: 'var(--color-surface-raise)' }}>
            <p style={{ fontSize: 10, color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
            {loading
              ? <div className="skeleton mt-1" style={{ height: 16, width: 60 }} />
              : <p style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color: 'var(--color-text-primary)', marginTop: 2 }}>{value !== undefined ? formatCurrency(value) : '—'}</p>
            }
          </div>
        ))}
      </div>

      {/* Category bars */}
      <div>
        <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
          By Category
        </p>
        {loadingCat ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => <div key={i} className="skeleton rounded" style={{ height: 28 }} />)}
          </div>
        ) : top5.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>No data</p>
        ) : (
          <div className="space-y-3">
            {top5.map((cat, i) => (
              <div key={cat.category}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: CHART_COLORS_DARK[i % CHART_COLORS_DARK.length], flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }} className="truncate">{cat.category}</span>
                  </div>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--color-text-primary)', flexShrink: 0, marginLeft: 6 }}>
                    {formatCurrency(cat.total)}
                  </span>
                </div>
                <div className="rounded-full overflow-hidden" style={{ height: 4, background: 'var(--color-border)' }}>
                  <div className="h-full rounded-full" style={{ width: `${cat.pct}%`, background: CHART_COLORS_DARK[i % CHART_COLORS_DARK.length] }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Recurring section ─────────────────────────────────────────────────────────

function RecurringTab() {
  const { data: recurring = [], isLoading } = useQuery({
    queryKey: ['recurring'],
    queryFn: workspaceApi.listRecurring,
    staleTime: 120_000,
  })

  const monthlyEstimate = recurring
    .filter((r) => r.frequency === 'monthly')
    .reduce((s, r) => s + r.amount, 0)

  if (isLoading) return <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Detecting…</p>

  if (recurring.length === 0) {
    return <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>No recurring transactions detected yet.</p>
  }

  return (
    <div>
      <div className="space-y-1.5 mb-4">
        {recurring.map((r, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <span
              style={{ fontSize: 12, color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}
              title={r.name}
            >
              {r.name}
            </span>
            <span className="px-1.5 py-0.5 rounded flex-shrink-0" style={{ fontSize: 10, background: 'var(--color-surface-raise)', color: 'var(--color-text-muted)' }}>
              {FREQ_LABEL[r.frequency]}
            </span>
            <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--color-text-primary)', flexShrink: 0 }}>
              {formatCurrency(r.amount)}
            </span>
          </div>
        ))}
      </div>
      {monthlyEstimate > 0 && (
        <div className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: 'var(--color-surface-raise)', border: '1px solid var(--color-border)' }}>
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Monthly subscriptions</span>
          <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--color-negative)' }}>{formatCurrency(monthlyEstimate)}</span>
        </div>
      )}
    </div>
  )
}

// ── Budget tab ────────────────────────────────────────────────────────────────

function BudgetTab() {
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [newCategory, setNewCategory] = useState(CATEGORIES[0])
  const [newAmount, setNewAmount] = useState('')

  const { data: budgets = [] } = useQuery({
    queryKey: ['budgets'],
    queryFn: workspaceApi.listBudgets,
    staleTime: 30_000,
  })

  const upsertMutation = useMutation({
    mutationFn: ({ category, amount }: { category: string; amount: number }) =>
      workspaceApi.upsertBudget(category, amount),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['budgets'] }); setAdding(false); setNewAmount('') },
  })

  const deleteMutation = useMutation({
    mutationFn: (category: string) => workspaceApi.deleteBudget(category),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budgets'] }),
  })

  const handleAdd = () => {
    const amt = parseFloat(newAmount)
    if (!newAmount || isNaN(amt) || amt <= 0) return
    upsertMutation.mutate({ category: newCategory, amount: amt })
  }

  return (
    <div className="space-y-3">
      {budgets.length === 0 && !adding && (
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>No budgets set.</p>
      )}

      {budgets.map((b) => {
        const over = b.spent > b.amount
        return (
          <div key={b.category}>
            <div className="flex items-center justify-between mb-1">
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {b.category}
              </span>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span style={{ fontSize: 11, fontFamily: 'monospace', color: over ? 'var(--color-negative)' : 'var(--color-text-muted)' }}>
                  {formatCurrency(b.spent)}/{formatCurrency(b.amount)}
                </span>
                <button onClick={() => deleteMutation.mutate(b.category)} style={{ color: 'var(--color-text-muted)', lineHeight: 1 }}>
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
            <ProgressBar value={b.spent} max={b.amount} />
          </div>
        )
      })}

      {adding ? (
        <div className="space-y-2">
          <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} style={{ fontSize: 12, width: '100%' }}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input
            type="number" placeholder="Monthly limit ($)" value={newAmount}
            onChange={(e) => setNewAmount(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            step="1" min="0" style={{ fontSize: 12, width: '100%' }} autoFocus
          />
          <div className="flex gap-1.5">
            <button onClick={handleAdd} disabled={upsertMutation.isPending} className="flex-1 rounded-md font-medium"
              style={{ background: 'var(--color-accent)', color: '#fff', padding: '5px 0', fontSize: 12 }}>
              Save
            </button>
            <button onClick={() => { setAdding(false); setNewAmount('') }} className="rounded-md"
              style={{ background: 'var(--color-surface-raise)', color: 'var(--color-text-muted)', padding: '5px 10px', fontSize: 12 }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="flex items-center gap-1.5"
          style={{ fontSize: 12, color: 'var(--color-text-muted)', paddingTop: 2 }}>
          <Plus size={12} /> Add budget
        </button>
      )}
    </div>
  )
}

// ── Groups tab ────────────────────────────────────────────────────────────────

function GroupForm({
  initial, onSave, onCancel, saving,
}: {
  initial?: Partial<CustomGroup>
  onSave: (name: string, color: string, goal: number | null) => void
  onCancel: () => void
  saving: boolean
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [color, setColor] = useState(initial?.color ?? GROUP_COLORS[0])
  const [goalStr, setGoalStr] = useState(initial?.goal != null ? String(initial.goal) : '')

  const handleSave = () => {
    if (!name.trim()) return
    const goal = goalStr ? parseFloat(goalStr) : null
    onSave(name.trim(), color, isNaN(goal as number) ? null : goal)
  }

  return (
    <div className="space-y-2.5">
      <input type="text" placeholder="Group name" value={name} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSave()} style={{ fontSize: 12, width: '100%' }} autoFocus />
      <div className="flex items-center gap-2">
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Color</span>
        <div className="flex gap-1.5">
          {GROUP_COLORS.map((c) => (
            <button key={c} onClick={() => setColor(c)} style={{
              width: 18, height: 18, borderRadius: '50%', background: c,
              border: color === c ? '2px solid var(--color-text-primary)' : '2px solid transparent',
              outline: color === c ? '1px solid var(--color-border)' : 'none',
            }} />
          ))}
        </div>
      </div>
      <input type="number" placeholder="Spending goal (optional)" value={goalStr}
        onChange={(e) => setGoalStr(e.target.value)} step="1" min="0" style={{ fontSize: 12, width: '100%' }} />
      <div className="flex gap-1.5">
        <button onClick={handleSave} disabled={saving || !name.trim()} className="flex-1 rounded-md font-medium"
          style={{ background: 'var(--color-accent)', color: '#fff', padding: '5px 0', fontSize: 12 }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onCancel} className="rounded-md"
          style={{ background: 'var(--color-surface-raise)', color: 'var(--color-text-muted)', padding: '5px 10px', fontSize: 12 }}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function GroupsTab() {
  const qc = useQueryClient()
  const { activeGroup, setActiveGroup } = useWorkspace()
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: workspaceApi.listGroups,
    staleTime: 15_000,
  })

  const createMutation = useMutation({
    mutationFn: ({ name, color, goal }: { name: string; color: string; goal: number | null }) =>
      workspaceApi.createGroup(name, color, goal),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groups'] }); setAdding(false) },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, name, color, goal }: { id: number; name: string; color: string; goal: number | null }) =>
      workspaceApi.updateGroup(id, name, color, goal),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groups'] }); setEditingId(null) },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => workspaceApi.deleteGroup(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['groups'] })
      if (activeGroup?.id === id) setActiveGroup(null)
    },
  })

  return (
    <div className="space-y-2">
      {groups.length === 0 && !adding && (
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
          No groups yet. Create one and tag transactions from the Ledger.
        </p>
      )}

      {groups.map((g) => {
        const isActive = activeGroup?.id === g.id

        if (editingId === g.id) {
          return (
            <div key={g.id} style={{ background: 'var(--color-surface-raise)', borderRadius: 8, padding: 10 }}>
              <GroupForm
                initial={g}
                onSave={(name, color, goal) => updateMutation.mutate({ id: g.id, name, color, goal })}
                onCancel={() => setEditingId(null)}
                saving={updateMutation.isPending}
              />
            </div>
          )
        }

        return (
          <div key={g.id} className="rounded-lg"
            style={{
              border: `1px solid ${isActive ? g.color : 'var(--color-border)'}`,
              background: isActive ? `${g.color}12` : 'transparent',
              padding: '8px 10px', cursor: 'pointer',
              transition: 'border-color 0.15s, background 0.15s',
            }}
            onClick={() => setActiveGroup(isActive ? null : g)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: g.color, flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {g.name}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => setEditingId(g.id)} style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Edit</button>
                <button onClick={() => deleteMutation.mutate(g.id)} style={{ color: 'var(--color-text-muted)', lineHeight: 1 }}>
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-1.5">
              <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--color-text-secondary)' }}>{formatCurrency(g.total)}</span>
              {g.goal != null
                ? <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>of {formatCurrency(g.goal)} goal</span>
                : <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{g.count} txn{g.count !== 1 ? 's' : ''}</span>
              }
            </div>
            {g.goal != null && <div style={{ marginTop: 6 }}><ProgressBar value={g.total} max={g.goal} color={g.color} /></div>}
            {isActive && <p style={{ fontSize: 11, color: g.color, marginTop: 6 }}>Click rows to tag ↗</p>}
          </div>
        )
      })}

      {adding ? (
        <div style={{ background: 'var(--color-surface-raise)', borderRadius: 8, padding: 10 }}>
          <GroupForm
            onSave={(name, color, goal) => createMutation.mutate({ name, color, goal })}
            onCancel={() => setAdding(false)}
            saving={createMutation.isPending}
          />
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="flex items-center gap-1.5"
          style={{ fontSize: 12, color: 'var(--color-text-muted)', paddingTop: 2 }}>
          <Plus size={12} /> New group
        </button>
      )}
    </div>
  )
}

// ── Active group banner (exported for pages) ──────────────────────────────────

export function ActiveGroupBanner() {
  const { activeGroup, setActiveGroup } = useWorkspace()
  if (!activeGroup) return null

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg"
      style={{ background: `${activeGroup.color}18`, border: `1px solid ${activeGroup.color}40`, marginBottom: 12 }}
    >
      <div style={{ width: 9, height: 9, borderRadius: '50%', background: activeGroup.color, flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: 'var(--color-text-primary)', flex: 1 }}>{activeGroup.name}</span>
      <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--color-text-muted)' }}>
        {formatCurrency(activeGroup.total)}
        {activeGroup.goal != null && ` / ${formatCurrency(activeGroup.goal)}`}
        {' · '}{activeGroup.count} txns
      </span>
      <span style={{ fontSize: 12, color: activeGroup.color }}>Click rows to tag</span>
      <button onClick={() => setActiveGroup(null)} style={{ color: 'var(--color-text-muted)', lineHeight: 1 }}>
        <X size={13} />
      </button>
    </div>
  )
}

// ── Tab icon map ──────────────────────────────────────────────────────────────

const TAB_ICON: Record<TabId, React.ElementType> = {
  recent:   Clock,
  insights: BarChart2,
  budgets:  Target,
  recurring:RefreshCw,
  groups:   Layers,
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface RightPanelProps {
  isOpen: boolean
  onToggle: () => void
}

const PANEL_HIDDEN_ROUTES = ['/settings', '/login']

export default function RightPanel({ isOpen, onToggle }: RightPanelProps) {
  const location = useLocation()

  if (PANEL_HIDDEN_ROUTES.includes(location.pathname)) return null

  const tabs = ROUTE_TABS[location.pathname] ?? DEFAULT_TABS
  const [activeTab, setActiveTab] = useState<TabId>(tabs[0])

  // Reset to first tab when route changes
  useEffect(() => {
    const newTabs = ROUTE_TABS[location.pathname] ?? DEFAULT_TABS
    setActiveTab(newTabs[0])
  }, [location.pathname])

  return (
    <div style={{ position: 'fixed', right: 0, top: 0, height: '100%', zIndex: 40 }}>
      {/* Toggle arrow tab — always visible, sits outside the aside */}
      <button
        onClick={onToggle}
        aria-label={isOpen ? 'Hide panel' : 'Show panel'}
        style={{
          position: 'absolute',
          left: -14,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 14,
          height: 52,
          borderRadius: '6px 0 0 6px',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRight: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 41,
          transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-raise)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-surface)')}
      >
        {isOpen
          ? <ChevronRight size={10} style={{ color: 'var(--color-text-muted)' }} />
          : <ChevronLeft size={10} style={{ color: 'var(--color-text-muted)' }} />
        }
      </button>

      {/* Panel */}
      <aside
        style={{
          width: isOpen ? PANEL_WIDTH : 0,
          height: '100%',
          overflow: 'hidden',
          transition: 'width 0.25s ease',
          background: 'var(--color-surface)',
          borderLeft: '1px solid var(--color-border)',
        }}
      >
        {/* Inner content — fixed width so it doesn't squish during animation */}
        <div style={{ width: PANEL_WIDTH, height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Tab bar */}
          <div
            className="flex flex-shrink-0"
            style={{ borderBottom: '1px solid var(--color-border)', paddingTop: 14, paddingLeft: 8, paddingRight: 8 }}
          >
            {tabs.map((tab) => {
              const Icon = TAB_ICON[tab]
              const isActive = activeTab === tab
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className="flex items-center gap-1.5 px-3 pb-2.5 flex-1 justify-center"
                  style={{
                    fontSize: 11,
                    fontWeight: isActive ? 600 : 500,
                    color: isActive ? 'var(--color-accent-text)' : 'var(--color-text-muted)',
                    borderTop: 'none',
                    borderLeft: 'none',
                    borderRight: 'none',
                    borderBottom: isActive ? '2px solid var(--color-accent)' : '2px solid transparent',
                    marginBottom: -1,
                    background: 'none',
                    cursor: 'pointer',
                    transition: 'color 0.15s',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Icon size={11} />
                  {TAB_LABEL[tab]}
                </button>
              )
            })}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto px-5 py-4" style={{ scrollbarWidth: 'thin' }}>
            {activeTab === 'recent'    && <RecentTab />}
            {activeTab === 'insights'  && <InsightsTab />}
            {activeTab === 'budgets'   && <BudgetTab />}
            {activeTab === 'recurring' && <RecurringTab />}
            {activeTab === 'groups'    && <GroupsTab />}
          </div>
        </div>
      </aside>
    </div>
  )
}
