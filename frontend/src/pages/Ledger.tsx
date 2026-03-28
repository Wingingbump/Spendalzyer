import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Check } from 'lucide-react'
import { ledgerApi, transactionsApi, workspaceApi } from '../lib/api'
import { Download } from 'lucide-react'
import { useFilters } from '../context/FilterContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { formatCurrency, formatDate } from '../lib/utils'
import SkeletonRow from '../components/SkeletonRow'
import { ActiveGroupBanner } from '../components/RightPanel'

interface EditState {
  [id: number]: {
    category?: string
    notes?: string
  }
}

interface SavedState {
  [id: number]: boolean
}

const CATEGORIES = [
  'Food & Drink', 'Groceries', 'Shopping', 'Transportation', 'Entertainment',
  'Bills & Utilities', 'Health & Fitness', 'Travel', 'Personal Care',
  'Home', 'Education', 'Business Services', 'Income', 'Transfer', 'Other',
]

export default function Ledger() {
  const { range, institution, account } = useFilters()
  const { activeGroup } = useWorkspace()
  const [search, setSearch] = useState('')
  const [types, setTypes] = useState<string[]>([])
  const [showTransfers, setShowTransfers] = useState(false)
  const [showDuplicates, setShowDuplicates] = useState(false)
  const [editState, setEditState] = useState<EditState>({})
  const [saved, setSaved] = useState<SavedState>({})
  const qc = useQueryClient()

  const { data: ledgerData, isLoading } = useQuery({
    queryKey: ['ledger', range, institution, account, search, types, showTransfers, showDuplicates],
    queryFn: () =>
      ledgerApi.list({
        range,
        institution,
        account,
        search,
        types: types.length > 0 ? types.join(',') : undefined,
        show_transfers: showTransfers || undefined,
        show_duplicates: showDuplicates || undefined,
      }),
  })

  const { data: groupTxData } = useQuery({
    queryKey: ['group-tx-ids', activeGroup?.id],
    queryFn: () => workspaceApi.groupTransactions(activeGroup!.id),
    enabled: !!activeGroup,
  })

  const groupTxIds = new Set((groupTxData?.transaction_ids ?? []).map(String))

  const rows = ledgerData?.rows ?? []
  const summary = ledgerData?.summary

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


  const patchMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { category?: string; notes?: string } }) =>
      transactionsApi.patch(id, data),
    onSuccess: (_, { id }) => {
      setSaved((s) => ({ ...s, [id]: true }))
      setTimeout(() => setSaved((s) => ({ ...s, [id]: false })), 1500)
      qc.invalidateQueries({ queryKey: ['ledger'] })
    },
  })

  const handleBlur = (rowId: number, field: 'category' | 'notes', originalValue: string) => {
    const edit = editState[rowId]
    if (!edit) return
    const value = edit[field]
    if (value === undefined || value === originalValue) return
    patchMutation.mutate({ id: rowId, data: { [field]: value } })
  }

  const setEdit = (id: number, field: 'category' | 'notes', value: string) => {
    setEditState((s) => ({ ...s, [id]: { ...s[id], [field]: value } }))
  }

  const toggleType = (t: string) => {
    setTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    )
  }

  return (
    <div className="space-y-4 fade-in" style={{ paddingBottom: 56 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)' }}>Ledger</h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>
          Full transaction history including transfers and duplicates
        </p>
      </div>

      <ActiveGroupBanner />

      {/* Filters bar */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative">
          <Search
            size={14}
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }}
          />
          <input
            type="search"
            placeholder="Search ledger…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 30, width: 220 }}
          />
        </div>

        {/* Type filter */}
        <div
          className="flex items-center gap-1 rounded-lg p-1"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          {['debit', 'credit'].map((t) => (
            <button
              key={t}
              onClick={() => toggleType(t)}
              className="px-3 py-1 rounded-md text-xs font-medium transition-colors"
              style={{
                background: types.includes(t) ? 'var(--color-surface-raise)' : 'transparent',
                color: types.includes(t) ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                border: types.includes(t) ? '1px solid var(--color-border)' : '1px solid transparent',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showTransfers}
            onChange={(e) => setShowTransfers(e.target.checked)}
          />
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Show transfers</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showDuplicates}
            onChange={(e) => setShowDuplicates(e.target.checked)}
          />
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Show duplicates</span>
        </label>

        <button
          onClick={() => ledgerApi.exportCsv({ range, institution, account, search, types: types.length > 0 ? types.join(',') : undefined, show_transfers: showTransfers || undefined, show_duplicates: showDuplicates || undefined })}
          className="flex items-center gap-1.5 ml-auto"
          style={{ fontSize: 12, color: 'var(--color-text-muted)', padding: '4px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
        >
          <Download size={13} />
          Export CSV
        </button>
      </div>

      <div
        className="rounded-xl"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <div className="overflow-x-auto" style={{ borderRadius: '12px 12px 0 0' }}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Name</th>
                <th>Merchant</th>
                <th>Category</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th>Institution</th>
                <th>Status</th>
                <th>Notes</th>
                <th style={{ width: 30 }}></th>
                {activeGroup && <th style={{ width: 28 }}></th>}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <SkeletonRow cols={activeGroup ? 10 : 9} rows={12} />
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '32px 0' }}>
                    No transactions found
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const currentCategory = editState[row.id]?.category !== undefined
                    ? editState[row.id].category!
                    : row.category
                  const currentNotes = editState[row.id]?.notes !== undefined
                    ? editState[row.id].notes!
                    : (row.notes ?? '')

                  const rowStyle: React.CSSProperties = {}
                  if (row.is_duplicate) rowStyle.opacity = 0.5
                  if (row.is_transfer) rowStyle.color = 'var(--color-text-muted)'

                  return (
                    <tr key={row.id} style={rowStyle}>
                      <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                        {formatDate(row.date)}
                      </td>
                      <td>
                        <span style={{ fontSize: 12, maxWidth: 160, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.name}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', maxWidth: 130, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.merchant_normalized || '—'}
                        </span>
                      </td>
                      <td className="editable-cell">
                        <select
                          value={currentCategory}
                          onChange={(e) => {
                            setEdit(row.id, 'category', e.target.value)
                            patchMutation.mutate({ id: row.id, data: { category: e.target.value } })
                          }}
                          style={{ fontSize: 12, minWidth: 130, border: 'none', background: 'transparent', padding: '2px 24px 2px 4px' }}
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                          {!CATEGORIES.includes(currentCategory) && currentCategory && (
                            <option value={currentCategory}>{currentCategory}</option>
                          )}
                        </select>
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>
                        <span style={{ color: row.amount < 0 ? 'var(--color-positive)' : 'var(--color-text-primary)' }}>
                          {formatCurrency(row.amount)}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                        {row.institution}
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          {row.pending && (
                            <span
                              className="px-1.5 py-0.5 rounded text-xs"
                              style={{ background: 'rgba(232, 193, 122, 0.15)', color: '#e8c17a', fontSize: 10 }}
                            >
                              pending
                            </span>
                          )}
                          {row.is_transfer && (
                            <span
                              className="px-1.5 py-0.5 rounded text-xs"
                              style={{ background: 'rgba(122, 174, 212, 0.15)', color: '#7aaed4', fontSize: 10 }}
                            >
                              transfer
                            </span>
                          )}
                          {row.is_duplicate && (
                            <span
                              className="px-1.5 py-0.5 rounded text-xs"
                              style={{ background: 'rgba(232, 96, 96, 0.15)', color: 'var(--color-negative)', fontSize: 10 }}
                            >
                              dup
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="editable-cell">
                        <input
                          type="text"
                          value={currentNotes}
                          placeholder="Add note…"
                          onChange={(e) => setEdit(row.id, 'notes', e.target.value)}
                          onBlur={() => handleBlur(row.id, 'notes', row.notes ?? '')}
                          style={{ fontSize: 12, minWidth: 110 }}
                        />
                      </td>
                      <td>
                        {saved[row.id] && (
                          <Check size={13} style={{ color: 'var(--color-positive)' }} />
                        )}
                      </td>
                      {activeGroup && (() => {
                        const txId = String(row.id)
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

      {summary && (
        <div
          className="flex items-center gap-8 px-6 flex-wrap"
          style={{
            position: 'fixed',
            bottom: 0,
            left: 220,
            right: 300,
            height: 56,
            borderTop: '1px solid var(--color-border)',
            background: 'var(--color-surface-raise)',
            zIndex: 10,
          }}
        >
          <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            {summary.transactions} transactions
          </span>
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Spent <span style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 600, color: 'var(--color-negative)', marginLeft: 6 }}>{formatCurrency(summary.spent)}</span>
          </span>
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Income <span style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 600, color: 'var(--color-positive)', marginLeft: 6 }}>{formatCurrency(summary.income)}</span>
          </span>
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Net <span style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 600, color: summary.net <= 0 ? 'var(--color-positive)' : 'var(--color-negative)', marginLeft: 6 }}>{formatCurrency(summary.net)}</span>
          </span>
          {summary.transfer_count > 0 && (
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              {summary.transfer_count} transfers hidden
            </span>
          )}
        </div>
      )}
    </div>
  )
}
