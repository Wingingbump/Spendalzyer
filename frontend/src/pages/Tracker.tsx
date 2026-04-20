import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Target, Wallet, RefreshCw, TrendingUp, TrendingDown, Minus,
  ChevronDown, ChevronUp, MessageSquare, Edit2, Check, X,
} from 'lucide-react'
import { advisorApi } from '../lib/api'
import type { TrackerGoal, TrackerBudget } from '../lib/api'
import { formatCurrency, formatMonth } from '../lib/utils'

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysLabel(days: number): string {
  if (days < 0) return 'Overdue'
  if (days === 0) return 'Due today'
  if (days < 30) return `${days}d left`
  if (days < 365) return `${Math.round(days / 30)}mo left`
  return `${(days / 365).toFixed(1)}yr left`
}

function paceColor(pct: number): string {
  if (pct > 100) return 'var(--color-negative)'
  if (pct > 85) return '#e8c17a'
  return 'var(--color-positive)'
}

function goalTypeLabel(type: string): string {
  const map: Record<string, string> = {
    emergency_fund: 'Emergency Fund',
    house: 'Home',
    retirement: 'Retirement',
    debt_payoff: 'Debt Payoff',
    investment: 'Investment',
    travel: 'Travel',
    education: 'Education',
    other: 'Other',
  }
  return map[type] ?? type
}

// ── Section header ─────────────────────────────────────────────────────────────

function SectionHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </h2>
      {count !== undefined && (
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 20,
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          color: 'var(--color-text-muted)',
        }}>{count}</span>
      )}
    </div>
  )
}

// ── Progress bar ───────────────────────────────────────────────────────────────

function ProgressBar({ pct, color = 'var(--color-accent)', thin = false }: { pct: number; color?: string; thin?: boolean }) {
  const h = thin ? 4 : 6
  return (
    <div style={{ height: h, borderRadius: h, background: 'var(--color-border)', overflow: 'hidden' }}>
      <div style={{
        height: h, borderRadius: h, width: `${Math.min(pct, 100)}%`,
        background: color, transition: 'width 0.4s ease',
      }} />
    </div>
  )
}

// ── Goal card ─────────────────────────────────────────────────────────────────

function GoalCard({ goal, onUpdateAmount }: {
  goal: TrackerGoal
  onUpdateAmount: (id: number, amount: number) => Promise<void>
}) {
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(goal.current_amount))
  const [saving, setSaving] = useState(false)

  const pct = goal.pct ?? 0
  const barColor = pct >= 100 ? 'var(--color-positive)' : goal.days_left !== null && goal.days_left < 30 ? '#e8c17a' : 'var(--color-accent)'

  const handleSave = async () => {
    const val = parseFloat(draft)
    if (isNaN(val) || val < 0) return
    setSaving(true)
    try {
      await onUpdateAmount(goal.id, val)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl p-4" style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
    }}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20,
              background: 'rgba(26,86,219,0.12)', color: 'var(--color-accent-text)',
              border: '1px solid rgba(26,86,219,0.25)',
            }}>{goalTypeLabel(goal.type)}</span>
            {goal.status === 'completed' && (
              <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, background: 'rgba(34,197,94,0.12)', color: 'var(--color-positive)', border: '1px solid rgba(34,197,94,0.25)' }}>
                Completed
              </span>
            )}
          </div>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', lineHeight: 1.3 }}>
            {goal.title}
          </h3>
        </div>
        <button
          onClick={() => navigate(`/advisor?q=How am I tracking toward my goal: ${encodeURIComponent(goal.title)}?`)}
          title="Ask advisor about this goal"
          style={{
            display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
            fontSize: 11, padding: '4px 9px', borderRadius: 8,
            background: 'transparent', color: 'var(--color-text-muted)',
            border: '1px solid var(--color-border)', cursor: 'pointer',
          }}
        >
          <MessageSquare size={11} />
          Ask
        </button>
      </div>

      {/* Progress bar */}
      {goal.target_amount !== null && (
        <div className="mb-3">
          <ProgressBar pct={pct} color={barColor} />
          <div className="flex justify-between items-center mt-1.5">
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'monospace' }}>
              {formatCurrency(goal.current_amount)}
            </span>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
              {pct.toFixed(0)}% of {formatCurrency(goal.target_amount)}
            </span>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="flex gap-3 flex-wrap mb-3">
        {goal.days_left !== null && (
          <div style={{
            fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 6,
            background: 'var(--color-bg)', border: '1px solid var(--color-border)',
            color: goal.days_left < 30 && goal.days_left >= 0 ? '#e8c17a' : goal.days_left < 0 ? 'var(--color-negative)' : 'var(--color-text-muted)',
          }}>
            {daysLabel(goal.days_left)}
          </div>
        )}
        {goal.monthly_needed !== null && goal.days_left !== null && goal.days_left > 0 && (
          <div style={{
            fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 6,
            background: 'var(--color-bg)', border: '1px solid var(--color-border)',
            color: 'var(--color-text-muted)',
          }}>
            {formatCurrency(goal.monthly_needed)}/mo needed
          </div>
        )}
        {pct >= 100 && (
          <div style={{
            fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
            background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)',
            color: 'var(--color-positive)',
          }}>
            Target reached!
          </div>
        )}
      </div>

      {/* Notes */}
      {goal.notes && (
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 10, fontStyle: 'italic', lineHeight: 1.5 }}>
          {goal.notes}
        </p>
      )}

      {/* Inline current amount editor */}
      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 10 }}>
        {editing ? (
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)', flexShrink: 0 }}>Current amount:</span>
            <input
              type="number"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false) }}
              autoFocus
              style={{
                flex: 1, fontSize: 13, padding: '4px 8px', borderRadius: 6,
                background: 'var(--color-bg)', border: '1px solid var(--color-accent)',
                color: 'var(--color-text-primary)', minWidth: 0,
              }}
            />
            <button onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', padding: 5, borderRadius: 6, background: 'var(--color-accent)', border: 'none', color: '#fff', cursor: 'pointer' }}>
              <Check size={12} />
            </button>
            <button onClick={() => setEditing(false)} style={{ display: 'flex', alignItems: 'center', padding: 5, borderRadius: 6, background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setDraft(String(goal.current_amount)); setEditing(true) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 11, color: 'var(--color-text-muted)', cursor: 'pointer',
              background: 'none', border: 'none', padding: 0,
            }}
          >
            <Edit2 size={10} />
            Update progress
          </button>
        )}
      </div>
    </div>
  )
}

// ── Budget card ───────────────────────────────────────────────────────────────

function BudgetCard({ budget }: { budget: TrackerBudget }) {
  const [expanded, setExpanded] = useState(false)
  const navigate = useNavigate()
  const pct = budget.amount > 0 ? (budget.spent / budget.amount) * 100 : 0
  const pacePct = budget.amount > 0 ? (budget.pace / budget.amount) * 100 : 0
  const color = paceColor(pacePct)

  const trend = budget.monthly_trend
  const prev = trend.length >= 2 ? trend[trend.length - 2].total : null
  const curr = trend.length >= 1 ? trend[trend.length - 1].total : null
  const trendDir = prev !== null && curr !== null
    ? curr > prev * 1.05 ? 'up' : curr < prev * 0.95 ? 'down' : 'flat'
    : null

  return (
    <div className="rounded-xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
      {/* Main row */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <div className="flex items-center gap-2">
              <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                {budget.category}
              </h3>
              {trendDir && (
                <span style={{ color: trendDir === 'up' ? 'var(--color-negative)' : trendDir === 'down' ? 'var(--color-positive)' : 'var(--color-text-muted)' }}>
                  {trendDir === 'up' ? <TrendingUp size={13} /> : trendDir === 'down' ? <TrendingDown size={13} /> : <Minus size={13} />}
                </span>
              )}
            </div>
            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 1 }}>
              {formatCurrency(budget.spent)} spent · budget {formatCurrency(budget.amount)}
            </p>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color, fontFamily: 'monospace' }}>
              {pct.toFixed(0)}%
            </span>
          </div>
        </div>

        <ProgressBar pct={pct} color={color} />

        {/* Pace line */}
        <div className="flex items-center justify-between mt-2">
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
            On pace for <span style={{ color, fontWeight: 600 }}>{formatCurrency(budget.pace)}</span> by month-end
          </span>
          <button
            onClick={() => navigate(`/advisor?q=Help me understand my ${budget.category} spending and how I can optimise it.`)}
            style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <MessageSquare size={10} />
            Ask
          </button>
        </div>
      </div>

      {/* Expandable detail */}
      {(budget.top_transactions.length > 0 || budget.monthly_trend.length > 0) && (
        <>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="w-full flex items-center justify-between px-4 py-2"
            style={{ background: 'var(--color-bg)', border: 'none', borderTop: '1px solid var(--color-border)', cursor: 'pointer' }}
          >
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 500 }}>
              {expanded ? 'Hide details' : `Show details · ${budget.top_transactions.length} transactions`}
            </span>
            {expanded ? <ChevronUp size={13} style={{ color: 'var(--color-text-muted)' }} /> : <ChevronDown size={13} style={{ color: 'var(--color-text-muted)' }} />}
          </button>

          {expanded && (
            <div className="px-4 pb-4" style={{ borderTop: '1px solid var(--color-border)' }}>
              {/* Monthly trend mini bars */}
              {budget.monthly_trend.length > 0 && (
                <div className="mt-3 mb-3">
                  <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                    3-Month Trend
                  </p>
                  <div className="flex gap-3">
                    {budget.monthly_trend.map((m) => {
                      const barPct = budget.amount > 0 ? Math.min((m.total / budget.amount) * 100, 100) : 0
                      return (
                        <div key={m.month} style={{ flex: 1 }}>
                          <div style={{ height: 40, background: 'var(--color-border)', borderRadius: 4, display: 'flex', alignItems: 'flex-end', overflow: 'hidden' }}>
                            <div style={{ width: '100%', height: `${barPct}%`, background: paceColor((m.total / (budget.amount || 1)) * 100), borderRadius: 4, transition: 'height 0.3s' }} />
                          </div>
                          <p style={{ fontSize: 9, color: 'var(--color-text-muted)', marginTop: 4, textAlign: 'center' }}>{formatMonth(m.month)}</p>
                          <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-secondary)', textAlign: 'center' }}>{formatCurrency(m.total)}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Top transactions */}
              {budget.top_transactions.length > 0 && (
                <div>
                  <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                    Top Transactions This Month
                  </p>
                  <div className="space-y-1.5">
                    {budget.top_transactions.map((tx, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span style={{ fontSize: 10, color: 'var(--color-text-muted)', flexShrink: 0, fontFamily: 'monospace' }}>{tx.date.slice(5)}</span>
                          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.name}</span>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'monospace', flexShrink: 0 }}>
                          {formatCurrency(tx.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Health tab ────────────────────────────────────────────────────────────────

function HealthTab({ data }: { data: NonNullable<ReturnType<typeof useTrackerData>['data']> }) {
  const { snapshots, recurring, summary } = data
  const navigate = useNavigate()

  const monthlyRecurringByCat = recurring.slice(0, 8)
  const totalRecurring = summary.total_recurring_monthly

  const latestRate = snapshots[0]?.savings_rate_pct
  const prevRate = snapshots[1]?.savings_rate_pct
  const rateDelta = latestRate !== null && latestRate !== undefined && prevRate !== null && prevRate !== undefined
    ? latestRate - prevRate : null

  return (
    <div className="space-y-6">
      {/* Savings rate trend */}
      {snapshots.length > 0 && (
        <div>
          <SectionHeader label="Savings Rate History" />
          <div className="rounded-xl p-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            {latestRate !== null && latestRate !== undefined && (
              <div className="flex items-end gap-3 mb-4">
                <span style={{ fontSize: 36, fontWeight: 800, color: latestRate >= 20 ? 'var(--color-positive)' : latestRate >= 10 ? '#e8c17a' : 'var(--color-negative)', fontFamily: 'monospace', lineHeight: 1 }}>
                  {latestRate.toFixed(1)}%
                </span>
                <div className="mb-1">
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>savings rate</p>
                  {rateDelta !== null && (
                    <p style={{ fontSize: 11, color: rateDelta >= 0 ? 'var(--color-positive)' : 'var(--color-negative)', fontWeight: 600 }}>
                      {rateDelta >= 0 ? '+' : ''}{rateDelta.toFixed(1)}pp vs last period
                    </p>
                  )}
                </div>
              </div>
            )}
            <div className="space-y-2">
              {snapshots.map((s) => {
                if (s.savings_rate_pct === null || s.savings_rate_pct === undefined) return null
                const barPct = Math.max(0, Math.min(s.savings_rate_pct, 50))
                return (
                  <div key={s.snapshot_date}>
                    <div className="flex justify-between items-center mb-1">
                      <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{s.snapshot_date}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: s.savings_rate_pct >= 20 ? 'var(--color-positive)' : s.savings_rate_pct >= 10 ? '#e8c17a' : 'var(--color-negative)' }}>
                        {s.savings_rate_pct.toFixed(1)}%
                      </span>
                    </div>
                    <ProgressBar pct={(barPct / 50) * 100} color={s.savings_rate_pct >= 20 ? 'var(--color-positive)' : s.savings_rate_pct >= 10 ? '#e8c17a' : 'var(--color-negative)'} thin />
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Recurring subscriptions */}
      {recurring.length > 0 && (
        <div>
          <SectionHeader label="Recurring Charges" count={recurring.length} />
          <div className="rounded-xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Est. monthly total</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'monospace' }}>
                {formatCurrency(totalRecurring)}/mo
              </span>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
              {monthlyRecurringByCat.map((r, i) => {
                const freqMultiplier: Record<string, number> = { weekly: 4.33, biweekly: 2.17, monthly: 1, quarterly: 1 / 3, annual: 1 / 12 }
                const monthlyEq = r.amount * (freqMultiplier[r.frequency] ?? 1)
                return (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <p style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{r.name}</p>
                      <p style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{formatCurrency(r.amount)} · {r.frequency}</p>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>
                      {formatCurrency(monthlyEq)}/mo
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="px-4 py-2.5" style={{ borderTop: '1px solid var(--color-border)' }}>
              <button
                onClick={() => navigate('/advisor?q=Which of my recurring subscriptions should I consider cancelling to save money?')}
                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--color-accent-text)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <MessageSquare size={12} />
                Ask advisor to review subscriptions
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Hook ──────────────────────────────────────────────────────────────────────

function useTrackerData() {
  return useQuery({
    queryKey: ['tracker'],
    queryFn: () => advisorApi.tracker(),
    staleTime: 60_000,
  })
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

type Tab = 'goals' | 'budgets' | 'health'

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Tracker() {
  const [tab, setTab] = useState<Tab>('goals')
  const qc = useQueryClient()
  const { data, isLoading, isError } = useTrackerData()

  const handleUpdateAmount = async (goalId: number, amount: number) => {
    await advisorApi.updateGoal(goalId, { current_amount: amount })
    await qc.invalidateQueries({ queryKey: ['tracker'] })
    await qc.invalidateQueries({ queryKey: ['goals', 'active'] })
  }

  const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
    { id: 'goals', label: 'Goals', icon: Target },
    { id: 'budgets', label: 'Budgets', icon: Wallet },
    { id: 'health', label: 'Health', icon: TrendingUp },
  ]

  return (
    <div className="fade-in" style={{ maxWidth: 800, margin: '0 auto' }}>

      {/* Page header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>
            Tracker
          </h1>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
            Goals, budgets, and your financial health at a glance
          </p>
        </div>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ['tracker'] })}
          disabled={isLoading}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, fontSize: 12,
            padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            color: 'var(--color-text-muted)',
          }}
        >
          <RefreshCw size={12} className={isLoading ? 'spinner' : ''} />
          Refresh
        </button>
      </div>

      {/* Summary strip */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          {[
            {
              label: 'Spent this month',
              value: formatCurrency(data.summary.mtd_spent),
              sub: `${data.summary.days_elapsed} of ${data.summary.days_in_month} days`,
            },
            {
              label: 'Month-end pace',
              value: formatCurrency(data.summary.mtd_pace),
              sub: data.summary.total_budget > 0 ? `vs ${formatCurrency(data.summary.total_budget)} budget` : 'no budget set',
            },
            {
              label: 'Monthly recurring',
              value: formatCurrency(data.summary.total_recurring_monthly),
              sub: `${data.recurring.length} charges detected`,
            },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl px-4 py-3" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
                {stat.label}
              </p>
              <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'monospace', lineHeight: 1 }}>
                {stat.value}
              </p>
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 3 }}>{stat.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', width: 'fit-content' }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 12, fontWeight: 500, padding: '6px 14px', borderRadius: 9, cursor: 'pointer',
              border: 'none', transition: 'all 0.15s',
              background: tab === id ? 'var(--color-accent)' : 'transparent',
              color: tab === id ? '#fff' : 'var(--color-text-muted)',
            }}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Body */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 rounded-full border-2 border-transparent spinner" style={{ borderTopColor: 'var(--color-accent)' }} />
        </div>
      )}

      {isError && (
        <div className="rounded-xl p-6 text-center" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <p style={{ fontSize: 14, color: 'var(--color-negative)' }}>Failed to load tracker data.</p>
        </div>
      )}

      {data && tab === 'goals' && (
        <div>
          <SectionHeader label="Active Goals" count={data.goals.filter(g => g.status === 'active').length} />
          {data.goals.filter(g => g.status === 'active').length === 0 ? (
            <div className="rounded-xl p-8 text-center" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <Target size={28} style={{ color: 'var(--color-text-muted)', margin: '0 auto 10px' }} />
              <p style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>No active goals yet.</p>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>Tell the advisor what you're working toward and it'll set one up.</p>
            </div>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
              {data.goals.filter(g => g.status === 'active').map((goal) => (
                <GoalCard key={goal.id} goal={goal} onUpdateAmount={handleUpdateAmount} />
              ))}
            </div>
          )}

          {data.goals.filter(g => g.status === 'completed').length > 0 && (
            <div className="mt-6">
              <SectionHeader label="Completed" count={data.goals.filter(g => g.status === 'completed').length} />
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
                {data.goals.filter(g => g.status === 'completed').map((goal) => (
                  <GoalCard key={goal.id} goal={goal} onUpdateAmount={handleUpdateAmount} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {data && tab === 'budgets' && (
        <div>
          <SectionHeader label="Monthly Budgets" count={data.budgets.length} />
          {data.budgets.length === 0 ? (
            <div className="rounded-xl p-8 text-center" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <Wallet size={28} style={{ color: 'var(--color-text-muted)', margin: '0 auto 10px' }} />
              <p style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>No budgets set yet.</p>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>Set budgets in the Workspace tab to track them here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.budgets.map((b) => <BudgetCard key={b.category} budget={b} />)}
            </div>
          )}
        </div>
      )}

      {data && tab === 'health' && <HealthTab data={data} />}
    </div>
  )
}
