import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, X, ChevronDown, ChevronRight, Layers, Target, RefreshCw } from 'lucide-react'
import { workspaceApi } from '../lib/api'
import type { CustomGroup } from '../lib/api'
import { useWorkspace } from '../context/WorkspaceContext'
import { formatCurrency } from '../lib/utils'

export const PANEL_WIDTH = 300

const CATEGORIES = [
  'Food & Drink', 'Groceries', 'Shopping', 'Transportation', 'Entertainment',
  'Bills & Utilities', 'Health & Fitness', 'Travel', 'Personal Care',
  'Home', 'Education', 'Business Services', 'Income', 'Transfer', 'Other',
]

const GROUP_COLORS = ['#c8ff00', '#5abf8a', '#7aaed4', '#e8c17a', '#c47adb', '#e86060']

const FREQ_LABEL: Record<string, string> = {
  weekly: 'weekly',
  biweekly: 'bi-wk',
  monthly: 'monthly',
  quarterly: 'qtrly',
  annual: 'annual',
}

// ── Shared ────────────────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  label,
  open,
  onToggle,
}: {
  icon: React.ElementType
  label: string
  open: boolean
  onToggle: () => void
}) {
  return (
    <button className="flex items-center justify-between w-full" onClick={onToggle} style={{ paddingBottom: 10 }}>
      <div className="flex items-center gap-2">
        <Icon size={13} style={{ color: 'var(--color-accent)' }} />
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)' }}>
          {label}
        </span>
      </div>
      {open
        ? <ChevronDown size={13} style={{ color: 'var(--color-text-muted)' }} />
        : <ChevronRight size={13} style={{ color: 'var(--color-text-muted)' }} />}
    </button>
  )
}

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

// ── Recurring section ─────────────────────────────────────────────────────────

function RecurringSection() {
  const [open, setOpen] = useState(true)

  const { data: recurring = [], isLoading } = useQuery({
    queryKey: ['recurring'],
    queryFn: workspaceApi.listRecurring,
    staleTime: 120_000,
  })

  const monthlyEstimate = recurring
    .filter((r) => r.frequency === 'monthly')
    .reduce((s, r) => s + r.amount, 0)

  return (
    <div>
      <SectionHeader icon={RefreshCw} label="Recurring" open={open} onToggle={() => setOpen((o) => !o)} />

      {open && (
        <div>
          {isLoading && (
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Detecting…</p>
          )}
          {!isLoading && recurring.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>No recurring transactions detected yet.</p>
          )}
          {!isLoading && recurring.length > 0 && (
            <>
              <div className="space-y-1.5" style={{ marginBottom: 10 }}>
                {recurring.map((r, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <span
                      style={{
                        fontSize: 12,
                        color: 'var(--color-text-secondary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1,
                      }}
                      title={r.name}
                    >
                      {r.name}
                    </span>
                    <span
                      className="px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{ fontSize: 10, background: 'var(--color-surface-raise)', color: 'var(--color-text-muted)' }}
                    >
                      {FREQ_LABEL[r.frequency]}
                    </span>
                    <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--color-text-primary)', flexShrink: 0 }}>
                      {formatCurrency(r.amount)}
                    </span>
                  </div>
                ))}
              </div>
              {monthlyEstimate > 0 && (
                <div
                  className="flex items-center justify-between rounded-lg px-3 py-2"
                  style={{ background: 'var(--color-surface-raise)', border: '1px solid var(--color-border)' }}
                >
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Monthly subscriptions</span>
                  <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--color-negative)' }}>
                    {formatCurrency(monthlyEstimate)}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Budget section ────────────────────────────────────────────────────────────

function BudgetSection() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(true)
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budgets'] })
      setAdding(false)
      setNewAmount('')
    },
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
    <div>
      <SectionHeader icon={Target} label="Budgets" open={open} onToggle={() => setOpen((o) => !o)} />

      {open && (
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
                type="number"
                placeholder="Monthly limit ($)"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                step="1" min="0"
                style={{ fontSize: 12, width: '100%' }}
                autoFocus
              />
              <div className="flex gap-1.5">
                <button onClick={handleAdd} disabled={upsertMutation.isPending} className="flex-1 rounded-md font-medium"
                  style={{ background: 'var(--color-accent)', color: '#000', padding: '5px 0', fontSize: 12 }}>
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
      )}
    </div>
  )
}

// ── Groups section ────────────────────────────────────────────────────────────

function GroupForm({
  initial,
  onSave,
  onCancel,
  saving,
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
      <input
        type="text"
        placeholder="Group name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        style={{ fontSize: 12, width: '100%' }}
        autoFocus
      />
      <div className="flex items-center gap-2">
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Color</span>
        <div className="flex gap-1.5">
          {GROUP_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              style={{
                width: 18, height: 18, borderRadius: '50%', background: c,
                border: color === c ? '2px solid var(--color-text-primary)' : '2px solid transparent',
                outline: color === c ? '1px solid var(--color-border)' : 'none',
              }}
            />
          ))}
        </div>
      </div>
      <input
        type="number"
        placeholder="Spending goal (optional)"
        value={goalStr}
        onChange={(e) => setGoalStr(e.target.value)}
        step="1" min="0"
        style={{ fontSize: 12, width: '100%' }}
      />
      <div className="flex gap-1.5">
        <button onClick={handleSave} disabled={saving || !name.trim()} className="flex-1 rounded-md font-medium"
          style={{ background: 'var(--color-accent)', color: '#000', padding: '5px 0', fontSize: 12 }}>
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

function GroupsSection() {
  const qc = useQueryClient()
  const { activeGroup, setActiveGroup } = useWorkspace()
  const [open, setOpen] = useState(true)
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
    <div>
      <SectionHeader icon={Layers} label="Groups" open={open} onToggle={() => setOpen((o) => !o)} />

      {open && (
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
              <div
                key={g.id}
                className="rounded-lg"
                style={{
                  border: `1px solid ${isActive ? g.color : 'var(--color-border)'}`,
                  background: isActive ? `${g.color}12` : 'transparent',
                  padding: '8px 10px',
                  cursor: 'pointer',
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
                  <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--color-text-secondary)' }}>
                    {formatCurrency(g.total)}
                  </span>
                  {g.goal != null && (
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                      of {formatCurrency(g.goal)} goal
                    </span>
                  )}
                  {g.goal == null && (
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                      {g.count} txn{g.count !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                {g.goal != null && (
                  <div style={{ marginTop: 6 }}>
                    <ProgressBar value={g.total} max={g.goal} color={g.color} />
                  </div>
                )}

                {isActive && (
                  <p style={{ fontSize: 11, color: g.color, marginTop: 6 }}>Click rows to tag ↗</p>
                )}
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
      )}
    </div>
  )
}

// ── Active group banner (exported for pages) ──────────────────────────────────

export function ActiveGroupBanner() {
  const { activeGroup, setActiveGroup } = useWorkspace()
  if (!activeGroup) return null

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 rounded-lg"
      style={{
        background: `${activeGroup.color}18`,
        border: `1px solid ${activeGroup.color}40`,
        marginBottom: 12,
      }}
    >
      <div style={{ width: 9, height: 9, borderRadius: '50%', background: activeGroup.color, flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: 'var(--color-text-primary)', flex: 1 }}>
        {activeGroup.name}
      </span>
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

// ── Main panel ────────────────────────────────────────────────────────────────

export default function RightPanel() {
  return (
    <aside
      className="fixed top-0 right-0 h-full flex flex-col overflow-y-auto z-10"
      style={{ width: PANEL_WIDTH, background: 'var(--color-surface)', borderLeft: '1px solid var(--color-border)' }}
    >
      <div className="px-5 py-5 flex-shrink-0">
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>
          Workspace
        </span>
      </div>

      <div className="mx-4 flex-shrink-0" style={{ height: 1, background: 'var(--color-border)', marginBottom: 16 }} />

      <div className="px-5 flex-shrink-0 space-y-5">
        <RecurringSection />
        <div style={{ height: 1, background: 'var(--color-border)' }} />
        <BudgetSection />
        <div style={{ height: 1, background: 'var(--color-border)' }} />
        <GroupsSection />
      </div>
    </aside>
  )
}
