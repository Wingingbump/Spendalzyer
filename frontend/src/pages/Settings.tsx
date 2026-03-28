import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Trash2, Plus, Sun, Moon, CreditCard, Shield, Palette, Tag, Pencil, AlertTriangle } from 'lucide-react'
import { accountsApi, plaidApi, settingsApi, categoriesApi } from '../lib/api'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import Card from '../components/Card'
import Spinner from '../components/Spinner'

const CATEGORIES = [
  'Food & Drink', 'Groceries', 'Shopping', 'Transportation', 'Entertainment',
  'Bills & Utilities', 'Health & Fitness', 'Travel', 'Personal Care',
  'Home', 'Education', 'Business Services', 'Income', 'Transfer', 'Other',
]

// Password change schema
const passwordSchema = z
  .object({
    current_password: z.string().min(1, 'Current password is required'),
    new_password: z.string().min(8, 'New password must be at least 8 characters'),
    confirm_password: z.string().min(1, 'Please confirm your password'),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  })

type PasswordFormData = z.infer<typeof passwordSchema>

// Mapping schema
const mappingSchema = z.object({
  external_category: z.string().min(1, 'External category is required'),
  internal_category: z.string().min(1, 'Internal category is required'),
})

type MappingFormData = z.infer<typeof mappingSchema>

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon size={16} style={{ color: 'var(--color-text-muted)' }} />
      <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>{title}</h2>
    </div>
  )
}

export default function Settings() {
  const { theme, setTheme } = useTheme()
  const { user, logout } = useAuth()
  const qc = useQueryClient()
  const plaidScriptLoaded = useRef(false)

  // ── Accounts ────────────────────────────────────────────────────────────────
  const { data: accounts = [], isLoading: loadingAccounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list(),
  })

  const deleteAccountMutation = useMutation({
    mutationFn: (id: number) => accountsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  })

  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState<number | null>(null)

  const handleDeleteAccount = (id: number) => {
    if (confirmDeleteAccount === id) {
      deleteAccountMutation.mutate(id)
      setConfirmDeleteAccount(null)
    } else {
      setConfirmDeleteAccount(id)
    }
  }

  // ── Plaid ────────────────────────────────────────────────────────────────────
  const [plaidLoading, setPlaidLoading] = useState(false)
  const [plaidError, setPlaidError] = useState('')

  const handleConnectPlaid = async () => {
    setPlaidLoading(true)
    setPlaidError('')
    try {
      const { link_token, signed_token } = await plaidApi.linkToken()

      if (!plaidScriptLoaded.current) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script')
          script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js'
          script.onload = () => { plaidScriptLoaded.current = true; resolve() }
          script.onerror = reject
          document.head.appendChild(script)
        })
      }

      const Plaid = (window as Window & { Plaid?: { create: (config: unknown) => { open: () => void } } }).Plaid
      if (!Plaid) throw new Error('Plaid script not loaded')

      const handler = Plaid.create({
        token: link_token,
        onSuccess: async (public_token: string, metadata: { institution: { name: string }; account: { subtype: string } | null; accounts: { subtype: string }[] }) => {
          try {
            const subtype = metadata.account?.subtype || metadata.accounts?.[0]?.subtype || 'bank'
            await plaidApi.exchange(public_token, metadata.institution?.name || 'Unknown', subtype, signed_token)
            qc.invalidateQueries({ queryKey: ['accounts'] })
            qc.invalidateQueries({ queryKey: ['institutions'] })
          } catch {
            setPlaidError('Failed to connect account')
          } finally {
            setPlaidLoading(false)
          }
        },
        onExit: () => setPlaidLoading(false),
        onLoad: () => {},
        onEvent: () => {},
      })
      handler.open()
    } catch {
      setPlaidError('Failed to initialize Plaid. Make sure the backend is running.')
      setPlaidLoading(false)
    }
  }

  // ── Password ────────────────────────────────────────────────────────────────
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [passwordError, setPasswordError] = useState('')

  const {
    register: registerPw,
    handleSubmit: handlePwSubmit,
    reset: resetPw,
    formState: { errors: pwErrors, isSubmitting: pwSubmitting },
  } = useForm<PasswordFormData>({ resolver: zodResolver(passwordSchema) })

  const onPasswordSubmit = async (data: PasswordFormData) => {
    setPasswordError('')
    setPasswordSuccess(false)
    try {
      await settingsApi.changePassword(data.current_password, data.new_password)
      setPasswordSuccess(true)
      resetPw()
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } }
      setPasswordError(axiosErr.response?.data?.detail || 'Failed to change password')
    }
  }

  // ── Category Mappings ────────────────────────────────────────────────────────
  const { data: mappings = [], isLoading: loadingMappings } = useQuery({
    queryKey: ['category-mappings'],
    queryFn: () => categoriesApi.mappings(),
  })

  const [mappingError, setMappingError] = useState('')
  const [mappingSuccess, setMappingSuccess] = useState(false)
  const [editingMapping, setEditingMapping] = useState<string | null>(null) // external_category being edited
  const [editingValue, setEditingValue] = useState('')

  const {
    register: registerMapping,
    handleSubmit: handleMappingSubmit,
    reset: resetMapping,
    formState: { errors: mappingErrors, isSubmitting: mappingSubmitting },
  } = useForm<MappingFormData>({ resolver: zodResolver(mappingSchema) })

  const upsertMappingMutation = useMutation({
    mutationFn: ({ external_category, internal_category }: { external_category: string; internal_category: string }) =>
      categoriesApi.addMapping(external_category, internal_category),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['category-mappings'] })
      setEditingMapping(null)
    },
  })

  const deleteMappingMutation = useMutation({
    mutationFn: (external_category: string) => categoriesApi.deleteMapping(external_category),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['category-mappings'] }),
  })

  const onMappingSubmit = async (data: MappingFormData) => {
    setMappingError('')
    setMappingSuccess(false)
    try {
      await categoriesApi.addMapping(data.external_category, data.internal_category)
      setMappingSuccess(true)
      resetMapping()
      qc.invalidateQueries({ queryKey: ['category-mappings'] })
      setTimeout(() => setMappingSuccess(false), 2000)
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } }
      setMappingError(axiosErr.response?.data?.detail || 'Failed to add mapping')
    }
  }

  const startEditMapping = (external_category: string, current_internal: string) => {
    setEditingMapping(external_category)
    setEditingValue(current_internal)
  }

  const saveEditMapping = () => {
    if (editingMapping && editingValue) {
      upsertMappingMutation.mutate({ external_category: editingMapping, internal_category: editingValue })
    }
  }

  // ── Account Deletion ─────────────────────────────────────────────────────────
  const { data: deletionData, refetch: refetchDeletion } = useQuery({
    queryKey: ['deletion-status'],
    queryFn: () => settingsApi.deletionStatus(),
  })

  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  const scheduleDeleteMutation = useMutation({
    mutationFn: () => settingsApi.deleteAccount(),
    onSuccess: () => {
      refetchDeletion()
      setShowDeleteModal(false)
      setDeleteConfirmText('')
      logout()
    },
  })

  const cancelDeletionMutation = useMutation({
    mutationFn: () => settingsApi.cancelDeletion(),
    onSuccess: () => refetchDeletion(),
  })

  const deletionScheduledAt = deletionData?.deletion_scheduled_at
    ? new Date(deletionData.deletion_scheduled_at)
    : null

  return (
    <div className="space-y-6 fade-in max-w-2xl mx-auto">
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)' }}>Settings</h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>
          Manage your account and preferences
        </p>
      </div>

      {/* ── Section 1: Connected Accounts ───────────────────────────────────── */}
      <Card>
        <SectionHeader icon={CreditCard} title="Connected Accounts" />

        {loadingAccounts ? (
          <Spinner size={18} />
        ) : accounts.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>No accounts connected yet.</p>
        ) : (
          <div className="space-y-2 mb-4">
            {accounts.map((acc) => (
              <div
                key={acc.id}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg"
                style={{ background: 'var(--color-surface-raise)', border: '1px solid var(--color-border)' }}
              >
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>{acc.name}</p>
                  <p style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                    {acc.account_type} · Added {new Date(acc.created_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteAccount(acc.id)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors"
                  style={{
                    background: confirmDeleteAccount === acc.id ? 'rgba(232, 96, 96, 0.15)' : 'transparent',
                    color: 'var(--color-negative)',
                    fontSize: 12,
                    border: confirmDeleteAccount === acc.id ? '1px solid rgba(232, 96, 96, 0.3)' : '1px solid transparent',
                  }}
                >
                  <Trash2 size={12} />
                  {confirmDeleteAccount === acc.id ? 'Confirm?' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={handleConnectPlaid}
          disabled={plaidLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-opacity disabled:opacity-60"
          style={{ background: 'var(--color-accent)', color: '#000', fontSize: 13 }}
        >
          {plaidLoading ? <Spinner size={14} /> : <Plus size={14} />}
          {plaidLoading ? 'Connecting…' : 'Connect Account'}
        </button>

        {plaidError && (
          <p className="mt-2" style={{ fontSize: 12, color: 'var(--color-negative)' }}>{plaidError}</p>
        )}
      </Card>

      {/* ── Section 2: Security ─────────────────────────────────────────────── */}
      <Card>
        <SectionHeader icon={Shield} title="Security" />

        <p className="mb-4" style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          Logged in as <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{user?.username}</span>
        </p>

        <form onSubmit={handlePwSubmit(onPasswordSubmit)} className="space-y-4">
          <div>
            <label className="block mb-1.5" style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
              Current Password
            </label>
            <input {...registerPw('current_password')} type="password" autoComplete="current-password" className="w-full max-w-sm" />
            {pwErrors.current_password && (
              <p className="mt-1" style={{ fontSize: 11, color: 'var(--color-negative)' }}>{pwErrors.current_password.message}</p>
            )}
          </div>
          <div>
            <label className="block mb-1.5" style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
              New Password
            </label>
            <input {...registerPw('new_password')} type="password" autoComplete="new-password" className="w-full max-w-sm" />
            {pwErrors.new_password && (
              <p className="mt-1" style={{ fontSize: 11, color: 'var(--color-negative)' }}>{pwErrors.new_password.message}</p>
            )}
          </div>
          <div>
            <label className="block mb-1.5" style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
              Confirm New Password
            </label>
            <input {...registerPw('confirm_password')} type="password" autoComplete="new-password" className="w-full max-w-sm" />
            {pwErrors.confirm_password && (
              <p className="mt-1" style={{ fontSize: 11, color: 'var(--color-negative)' }}>{pwErrors.confirm_password.message}</p>
            )}
          </div>

          {passwordError && <p style={{ fontSize: 12, color: 'var(--color-negative)' }}>{passwordError}</p>}
          {passwordSuccess && <p style={{ fontSize: 12, color: 'var(--color-positive)' }}>Password updated successfully</p>}

          <button
            type="submit"
            disabled={pwSubmitting}
            className="px-4 py-2 rounded-lg font-medium transition-opacity disabled:opacity-60"
            style={{ background: 'var(--color-accent)', color: '#000', fontSize: 13 }}
          >
            {pwSubmitting ? 'Updating…' : 'Update Password'}
          </button>
        </form>
      </Card>

      {/* ── Section 3: Appearance ───────────────────────────────────────────── */}
      <Card>
        <SectionHeader icon={Palette} title="Appearance" />

        <div className="flex items-center gap-3">
          <button
            onClick={() => setTheme('dark')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all"
            style={{
              background: theme === 'dark' ? 'var(--color-accent)' : 'var(--color-surface-raise)',
              color: theme === 'dark' ? '#000' : 'var(--color-text-secondary)',
              border: theme === 'dark' ? '1px solid transparent' : '1px solid var(--color-border)',
              fontSize: 13,
            }}
          >
            <Moon size={14} /> Dark
          </button>
          <button
            onClick={() => setTheme('light')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all"
            style={{
              background: theme === 'light' ? 'var(--color-accent)' : 'var(--color-surface-raise)',
              color: theme === 'light' ? '#000' : 'var(--color-text-secondary)',
              border: theme === 'light' ? '1px solid transparent' : '1px solid var(--color-border)',
              fontSize: 13,
            }}
          >
            <Sun size={14} /> Light
          </button>
        </div>
      </Card>

      {/* ── Section 4: Category Mappings ────────────────────────────────────── */}
      <Card>
        <SectionHeader icon={Tag} title="Category Mappings" />
        <p className="mb-4" style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          Control how imported category names map to your internal categories.
        </p>

        {loadingMappings ? (
          <Spinner size={16} />
        ) : mappings.length > 0 ? (
          <div className="rounded-lg overflow-hidden mb-4" style={{ border: '1px solid var(--color-border)' }}>
            <table>
              <thead>
                <tr>
                  <th>External Category</th>
                  <th>Maps To</th>
                  <th style={{ width: 72 }}></th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((m, i) => (
                  <tr key={i}>
                    <td style={{ fontSize: 13 }}>{m.external_category}</td>
                    <td style={{ fontSize: 13 }}>
                      {editingMapping === m.external_category ? (
                        <select
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onBlur={saveEditMapping}
                          autoFocus
                          style={{ fontSize: 12, padding: '2px 8px' }}
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                          {!CATEGORIES.includes(editingValue) && editingValue && (
                            <option value={editingValue}>{editingValue}</option>
                          )}
                        </select>
                      ) : (
                        <span
                          className="px-2 py-0.5 rounded-full"
                          style={{ background: 'var(--color-surface-raise)', fontSize: 12 }}
                        >
                          {m.internal_category}
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => startEditMapping(m.external_category, m.internal_category)}
                          title="Edit"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: '2px 4px' }}
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => deleteMappingMutation.mutate(m.external_category)}
                          title="Delete"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-negative)', padding: '2px 4px' }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mb-4" style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>No mappings configured.</p>
        )}

        <form onSubmit={handleMappingSubmit(onMappingSubmit)}>
          <p className="mb-3" style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            Add New Mapping
          </p>
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <input
                {...registerMapping('external_category')}
                type="text"
                placeholder="External (e.g. FOOD_AND_DRINK)"
                className="w-full"
              />
              {mappingErrors.external_category && (
                <p className="mt-1" style={{ fontSize: 11, color: 'var(--color-negative)' }}>
                  {mappingErrors.external_category.message}
                </p>
              )}
            </div>
            <div className="flex-1">
              <select {...registerMapping('internal_category')} className="w-full">
                <option value="">Select category…</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              {mappingErrors.internal_category && (
                <p className="mt-1" style={{ fontSize: 11, color: 'var(--color-negative)' }}>
                  {mappingErrors.internal_category.message}
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={mappingSubmitting}
              className="px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-medium transition-opacity disabled:opacity-60 flex-shrink-0"
              style={{ background: 'var(--color-accent)', color: '#000', fontSize: 13 }}
            >
              <Plus size={13} />
              Add
            </button>
          </div>

          {mappingError && <p className="mt-2" style={{ fontSize: 12, color: 'var(--color-negative)' }}>{mappingError}</p>}
          {mappingSuccess && <p className="mt-2" style={{ fontSize: 12, color: 'var(--color-positive)' }}>Mapping added</p>}
        </form>
      </Card>

      {/* ── Section 5: Danger Zone ───────────────────────────────────────────── */}
      <Card>
        <SectionHeader icon={AlertTriangle} title="Danger Zone" />

        {deletionScheduledAt ? (
          <div className="rounded-lg px-4 py-3" style={{ background: 'rgba(232, 96, 96, 0.08)', border: '1px solid rgba(232, 96, 96, 0.25)' }}>
            <p style={{ fontSize: 13, color: 'var(--color-negative)', fontWeight: 500, marginBottom: 4 }}>
              Account deletion scheduled
            </p>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
              Your account and all data will be permanently deleted on{' '}
              <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                {deletionScheduledAt.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
              </span>
              . You can cancel this at any time before that date.
            </p>
            <button
              onClick={() => cancelDeletionMutation.mutate()}
              disabled={cancelDeletionMutation.isPending}
              className="px-4 py-2 rounded-lg font-medium transition-opacity disabled:opacity-60"
              style={{ background: 'var(--color-surface-raise)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', fontSize: 13 }}
            >
              {cancelDeletionMutation.isPending ? 'Cancelling…' : 'Cancel deletion'}
            </button>
          </div>
        ) : (
          <>
            <p className="mb-4" style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              Permanently remove your account and all associated data. This is a 30-day grace period deletion — you can restore your account within that window.
            </p>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium"
              style={{ background: 'rgba(232, 96, 96, 0.1)', border: '1px solid rgba(232, 96, 96, 0.3)', color: 'var(--color-negative)', fontSize: 13 }}
            >
              <Trash2 size={14} />
              Delete my account
            </button>
          </>
        )}
      </Card>

      {/* ── Delete Account Modal ─────────────────────────────────────────────── */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.5)', zIndex: 50 }}
          onClick={(e) => { if (e.target === e.currentTarget) { setShowDeleteModal(false); setDeleteConfirmText('') } }}
        >
          <div
            className="rounded-2xl p-6 w-full"
            style={{ maxWidth: 400, background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={16} style={{ color: 'var(--color-negative)' }} />
              <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)' }}>Delete account</h2>
            </div>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
              This will schedule your account for deletion in <strong style={{ color: 'var(--color-text-secondary)' }}>30 days</strong>. All your transactions, accounts, and settings will be removed. You can cancel within the 30-day window.
            </p>
            <p className="mb-2" style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
              Type <span style={{ fontFamily: 'monospace', color: 'var(--color-text-primary)' }}>delete</span> to confirm
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="delete"
              className="w-full mb-4"
              style={{ fontSize: 13 }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowDeleteModal(false); setDeleteConfirmText('') }}
                className="flex-1 py-2 rounded-lg font-medium"
                style={{ background: 'var(--color-surface-raise)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', fontSize: 13, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => scheduleDeleteMutation.mutate()}
                disabled={deleteConfirmText !== 'delete' || scheduleDeleteMutation.isPending}
                className="flex-1 py-2 rounded-lg font-semibold transition-opacity disabled:opacity-40"
                style={{ background: 'var(--color-negative)', color: '#fff', fontSize: 13, cursor: 'pointer', border: 'none' }}
              >
                {scheduleDeleteMutation.isPending ? 'Scheduling…' : 'Delete my account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
