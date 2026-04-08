import axios from 'axios'

const BASE_URL = (import.meta as unknown as { env: { VITE_API_URL?: string } }).env.VITE_API_URL || '/api'

export const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Response interceptor: try token refresh on 401, retry once; signal logout if refresh fails
let _refreshing: Promise<void> | null = null

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const url: string = error.config?.url || ''
    const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/refresh') || url.includes('/auth/me')

    if (error.response?.status === 401 && !isAuthEndpoint && !error.config?._retried) {
      if (!_refreshing) {
        _refreshing = api.post('/auth/refresh').then(() => undefined)
      }
      try {
        await _refreshing
        _refreshing = null
        return api({ ...error.config, _retried: true })
      } catch {
        _refreshing = null
        // Dispatch a soft logout event instead of hard-reloading — prevents the
        // reload loop where every reload restarts the failing auth cycle.
        window.dispatchEvent(new Event('auth:logout'))
        return Promise.reject(error)
      }
    }

    return Promise.reject(error)
  }
)

// ─── Types ───────────────────────────────────────────────────────────────────

export interface User {
  id: number
  username: string
}

export interface InsightsSummary {
  total_spent: number
  transaction_count: number
  net_spend: number
  this_month: number
  last_month: number
  delta: number
  delta_pct: number
  biggest_purchase: { amount: number; name: string; date: string } | null
  most_visited_merchant: { merchant: string; count: number; total: number } | null
  biggest_spending_day: { date: string; total: number } | null
}

export interface MonthlyData {
  month: string
  total: number
  count: number
}

export interface CategoryData {
  category: string
  total: number
  count: number
  pct: number
}

export interface DowData {
  day: string
  total: number
  count: number
}

export interface PlaidAccount {
  plaid_account_id: string
  name: string
  mask: string
  institution: string
}

export interface Transaction {
  id: number
  date: string
  name: string
  merchant_normalized: string
  category: string
  amount: number
  institution: string
  pending: boolean
  notes: string
  has_user_override: boolean
}

export interface LedgerSummary {
  transactions: number
  spent: number
  income: number
  net: number
  transfer_count: number
}

export interface LedgerRow {
  id: number
  date: string
  name: string
  merchant_normalized: string
  category: string
  amount: number
  institution: string
  pending: boolean
  notes: string
  has_user_override: boolean
  is_transfer?: boolean
  is_duplicate?: boolean
}

export interface LedgerResponse {
  summary: LedgerSummary
  rows: LedgerRow[]
}

export interface MerchantData {
  merchant_normalized: string
  total: number
  count: number
}

export interface Account {
  id: number
  name: string
  account_type: string
  created_at: string
}

export interface CategoryMapping {
  external_category: string
  internal_category: string
}

export interface SyncResult {
  synced_count: number
  last_synced_at: string
}

export interface LastSynced {
  last_synced_at: string | null
}

// ─── Filter Params ───────────────────────────────────────────────────────────

export interface FilterParams {
  range?: string
  institution?: string
  account?: string
  search?: string
  types?: string
  show_transfers?: boolean
  show_duplicates?: boolean
  [key: string]: string | boolean | undefined
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export const authApi = {
  login: (username: string, password: string) =>
    api.post<User>('/auth/login', { username, password }).then((r) => r.data),

  register: (username: string, password: string, first_name: string, last_name: string, email: string, phone: string) =>
    api.post<{ message: string }>('/auth/register', { username, password, first_name, last_name, email, phone }).then((r) => r.data),

  verifyEmail: (token: string) =>
    api.post<User>('/auth/verify-email', { token }).then((r) => r.data),

  resendVerification: (email: string) =>
    api.post<{ message: string }>('/auth/resend-verification', { email }).then((r) => r.data),

  forgotPassword: (email: string) =>
    api.post<{ message: string }>('/auth/forgot-password', { email }).then((r) => r.data),

  resetPassword: (token: string, new_password: string) =>
    api.post<{ ok: boolean }>('/auth/reset-password', { token, new_password }).then((r) => r.data),

  logout: () =>
    api.post<{ ok: boolean }>('/auth/logout').then((r) => r.data),

  me: () =>
    api.get<User>('/auth/me').then((r) => r.data),
}

// ─── Insights ────────────────────────────────────────────────────────────────

export const insightsApi = {
  summary: (params?: FilterParams) =>
    api.get<InsightsSummary>('/insights/summary', { params: cleanParams(params) }).then((r) => r.data),

  monthly: (params?: FilterParams) =>
    api.get<MonthlyData[]>('/insights/monthly', { params: cleanParams(params) }).then((r) => r.data),

  categories: (params?: FilterParams) =>
    api.get<CategoryData[]>('/insights/categories', { params: cleanParams(params) }).then((r) => r.data),

  dow: (params?: FilterParams) =>
    api.get<DowData[]>('/insights/dow', { params: cleanParams(params) }).then((r) => r.data),

  institutions: () =>
    api.get<string[]>('/insights/institutions').then((r) => r.data),

  accounts: (params?: FilterParams) =>
    api.get<PlaidAccount[]>('/insights/accounts', { params: cleanParams(params) }).then((r) => r.data),
}

// ─── Transactions ────────────────────────────────────────────────────────────

export const transactionsApi = {
  list: (params?: FilterParams & { search?: string }) =>
    api.get<Transaction[]>('/transactions', { params: cleanParams(params) }).then((r) => r.data),

  patch: (id: number, data: { category?: string; amount?: number; notes?: string }) =>
    api.patch<{ ok: boolean }>(`/transactions/${id}`, data).then((r) => r.data),
}

// ─── Ledger ──────────────────────────────────────────────────────────────────

export const ledgerApi = {
  list: (params?: FilterParams & {
    search?: string
    types?: string
    show_transfers?: boolean
    show_duplicates?: boolean
  }) => api.get<LedgerResponse>('/ledger', { params: cleanParams(params) }).then((r) => r.data),

  exportCsv: (params?: FilterParams & {
    search?: string
    types?: string
    show_transfers?: boolean
    show_duplicates?: boolean
  }) =>
    api.get('/ledger/export', { params: cleanParams(params), responseType: 'blob' }).then((r) => {
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a')
      a.href = url
      a.download = 'ledger.csv'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }),
}

// ─── Merchants ───────────────────────────────────────────────────────────────

export const merchantsApi = {
  list: (params?: FilterParams) =>
    api.get<MerchantData[]>('/merchants', { params: cleanParams(params) }).then((r) => r.data),

  detail: (name: string, params?: FilterParams) =>
    api.get<Transaction[]>(`/merchants/${encodeURIComponent(name)}`, { params: cleanParams(params) }).then((r) => r.data),

  overrides: () =>
    api.get<Record<string, string>>('/merchants/overrides').then((r) => r.data),

  saveOverride: (rawName: string, displayName: string) =>
    api.put(`/merchants/overrides/${encodeURIComponent(rawName)}`, { display_name: displayName }).then((r) => r.data),

  deleteOverride: (rawName: string) =>
    api.delete(`/merchants/overrides/${encodeURIComponent(rawName)}`).then((r) => r.data),
}

// ─── Categories ──────────────────────────────────────────────────────────────

export const categoriesApi = {
  list: (params?: FilterParams) =>
    api.get<CategoryData[]>('/categories', { params: cleanParams(params) }).then((r) => r.data),

  detail: (name: string, params?: FilterParams) =>
    api.get<Transaction[]>(`/categories/${encodeURIComponent(name)}`, { params: cleanParams(params) }).then((r) => r.data),

  mappings: () =>
    api.get<CategoryMapping[]>('/categories/mappings').then((r) => r.data),

  addMapping: (external_category: string, internal_category: string) =>
    api.post<{ ok: boolean }>('/categories/mappings', { external_category, internal_category }).then((r) => r.data),

  deleteMapping: (external_category: string) =>
    api.delete<{ ok: boolean }>(`/categories/mappings/${encodeURIComponent(external_category)}`).then((r) => r.data),
}

// ─── Accounts ────────────────────────────────────────────────────────────────

export const accountsApi = {
  list: () =>
    api.get<Account[]>('/accounts').then((r) => r.data),

  delete: (id: number) =>
    api.delete<{ ok: boolean }>(`/accounts/${id}`).then((r) => r.data),

  plaid: () =>
    api.get<PlaidAccount[]>('/accounts/plaid').then((r) => r.data),
}

// ─── Plaid ───────────────────────────────────────────────────────────────────

export const plaidApi = {
  linkToken: () =>
    api.get<{ link_token: string; signed_token: string }>('/plaid/link-token').then((r) => r.data),

  exchange: (public_token: string, institution: string, account_type: string, signed_token: string) =>
    api.post<{ ok: boolean }>('/plaid/exchange', { public_token, institution, account_type, signed_token }).then((r) => r.data),
}

// ─── Sync ────────────────────────────────────────────────────────────────────

export const syncApi = {
  sync: (fullSync = false) =>
    api.post<SyncResult>('/sync', null, { params: fullSync ? { full_sync: true } : {} }).then((r) => r.data),
}

// ─── Settings ────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: number
  username: string
  first_name: string
  last_name: string
  email: string
  phone: string
  avatar_url: string | null
  email_verified: boolean
  created_at: string
}

export const settingsApi = {
  changePassword: (current_password: string, new_password: string) =>
    api.put<{ ok: boolean }>('/settings/password', { current_password, new_password }).then((r) => r.data),

  lastSynced: () =>
    api.get<LastSynced>('/settings/last-synced').then((r) => r.data),

  deletionStatus: () =>
    api.get<{ deletion_scheduled_at: string | null }>('/settings/deletion-status').then((r) => r.data),

  deleteAccount: () =>
    api.post<{ ok: boolean; deletion_scheduled_at: string | null }>('/settings/delete-account').then((r) => r.data),

  cancelDeletion: () =>
    api.post<{ ok: boolean }>('/settings/cancel-deletion').then((r) => r.data),

  getProfile: () =>
    api.get<UserProfile>('/settings/profile').then((r) => r.data),

  updateProfile: (first_name: string, last_name: string, phone: string) =>
    api.put<{ ok: boolean }>('/settings/profile', { first_name, last_name, phone }).then((r) => r.data),

  uploadAvatar: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<{ avatar_url: string }>('/settings/avatar', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data)
  },
}

// ─── Canvas ──────────────────────────────────────────────────────────────────

export type WidgetType = 'metric' | 'bar' | 'line' | 'pie' | 'sankey'
export type WidgetSource = 'categories' | 'monthly' | 'merchants' | 'dow' | 'summary' | 'sankey'

export interface CanvasWidget {
  id: string
  type: WidgetType
  title: string
  config: {
    source: WidgetSource
    field?: string
    metric?: 'amount' | 'count'
    limit?: number
  }
}

export interface CanvasLayoutItem {
  i: string
  x: number
  y: number
  w: number
  h: number
}

export interface CanvasMeta {
  id: number
  name: string
  created_at: string
}

export interface CanvasData extends CanvasMeta {
  layout: CanvasLayoutItem[]
  widgets: Record<string, CanvasWidget>
}

export interface SankeyData {
  nodes: Array<{ name: string }>
  links: Array<{ source: number; target: number; value: number }>
}

export const canvasApi = {
  list: () =>
    api.get<CanvasMeta[]>('/canvas').then((r) => r.data),

  load: (id: number) =>
    api.get<CanvasData>(`/canvas/${id}`).then((r) => r.data),

  create: (name: string) =>
    api.post<CanvasMeta>('/canvas', { name }).then((r) => r.data),

  save: (id: number, state: { name: string; layout: CanvasLayoutItem[]; widgets: Record<string, CanvasWidget> }) =>
    api.put<{ ok: boolean }>(`/canvas/${id}`, state).then((r) => r.data),

  delete: (id: number) =>
    api.delete<{ ok: boolean }>(`/canvas/${id}`).then((r) => r.data),

  sankey: (params?: FilterParams) =>
    api.get<SankeyData>('/canvas/sankey', { params: cleanParams(params) }).then((r) => r.data),
}

// ─── Workspace ───────────────────────────────────────────────────────────────

export interface Budget {
  id: number
  category: string
  amount: number
  period: string
  spent: number
}

export interface CustomGroup {
  id: number
  name: string
  color: string
  goal: number | null
  total: number
  count: number
}

export interface RecurringTransaction {
  name: string
  amount: number
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual'
  occurrences: number
  last_date: string
}

export interface GroupTransactionsResponse {
  rows: LedgerRow[]
  total: number
  count: number
  transaction_ids: string[]
}

export const workspaceApi = {
  listBudgets: () =>
    api.get<Budget[]>('/workspace/budgets').then((r) => r.data),

  upsertBudget: (category: string, amount: number, period = 'monthly') =>
    api.put<{ ok: boolean }>(`/workspace/budgets/${encodeURIComponent(category)}`, { amount, period }).then((r) => r.data),

  deleteBudget: (category: string) =>
    api.delete<{ ok: boolean }>(`/workspace/budgets/${encodeURIComponent(category)}`).then((r) => r.data),

  listGroups: () =>
    api.get<CustomGroup[]>('/workspace/groups').then((r) => r.data),

  listRecurring: () =>
    api.get<RecurringTransaction[]>('/workspace/recurring').then((r) => r.data),

  createGroup: (name: string, color: string, goal?: number | null) =>
    api.post<{ id: number }>('/workspace/groups', { name, color, goal: goal ?? null }).then((r) => r.data),

  updateGroup: (id: number, name: string, color: string, goal?: number | null) =>
    api.put<{ ok: boolean }>(`/workspace/groups/${id}`, { name, color, goal: goal ?? null }).then((r) => r.data),

  deleteGroup: (id: number) =>
    api.delete<{ ok: boolean }>(`/workspace/groups/${id}`).then((r) => r.data),

  groupTransactions: (id: number) =>
    api.get<GroupTransactionsResponse>(`/workspace/groups/${id}/transactions`).then((r) => r.data),

  addTransaction: (groupId: number, transactionId: string) =>
    api.post<{ ok: boolean }>(`/workspace/groups/${groupId}/transactions`, { transaction_id: transactionId }).then((r) => r.data),

  removeTransaction: (groupId: number, transactionId: string) =>
    api.delete<{ ok: boolean }>(`/workspace/groups/${groupId}/transactions/${encodeURIComponent(transactionId)}`).then((r) => r.data),
}

// ─── Advisor ─────────────────────────────────────────────────────────────────

export interface Goal {
  id: number
  title: string
  type: string
  target_amount: number | null
  current_amount: number
  deadline: string | null
  priority: number
  status: string
  notes: string | null
  created_at: string
  updated_at: string
}

export interface UserFinancialProfile {
  first_name?: string | null
  last_name?: string | null
  life_stage?: string | null
  risk_tolerance?: string | null
  income_estimate?: number | null
  communication_style?: string | null
  has_profile: boolean
}

export interface AdviceRecord {
  id: number
  prompt_summary: string | null
  user_message: string | null
  response_text: string
  category: string | null
  compliance_flags: string[]
  user_reaction: string
  outcome_notes: string | null
  created_at: string
}

// ─── Tracker types ────────────────────────────────────────────────────────────

export interface TrackerGoal {
  id: number
  title: string
  type: string
  target_amount: number | null
  current_amount: number
  deadline: string | null
  priority: number
  status: string
  notes: string | null
  pct: number | null
  days_left: number | null
  monthly_needed: number | null
}

export interface TrackerTransaction {
  date: string
  name: string
  amount: number
}

export interface MonthlyTrend {
  month: string
  total: number
}

export interface TrackerBudget {
  category: string
  amount: number
  spent: number
  pace: number
  top_transactions: TrackerTransaction[]
  monthly_trend: MonthlyTrend[]
}

export interface TrackerRecurring {
  name: string
  amount: number
  frequency: string
}

export interface TrackerSnapshot {
  snapshot_date: string
  income_estimate: number | null
  total_expenses: number | null
  savings_rate_pct: number | null
}

export interface TrackerSummary {
  mtd_spent: number
  mtd_pace: number
  days_elapsed: number
  days_in_month: number
  total_budget: number
  total_recurring_monthly: number
}

export interface TrackerData {
  goals: TrackerGoal[]
  budgets: TrackerBudget[]
  recurring: TrackerRecurring[]
  snapshots: TrackerSnapshot[]
  summary: TrackerSummary
}

export const advisorApi = {
  chat: (message: string, history?: Array<{ role: 'user' | 'assistant'; content: string }>) =>
    api.post<{ response: string; advice_id: number; compliance_flags: string[]; actions: Array<{ label: string; message: string }> }>('/advisor/chat', { message, history: history ?? [] }).then((r) => r.data),

  chatStream: (
    message: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    onDelta: (text: string) => void,
    onCorrection: (text: string) => void,
  ): Promise<{ advice_id: number; flags: string[]; actions: Array<{ label: string; message: string }> }> => {
    const baseUrl = (import.meta as unknown as { env: { VITE_API_URL?: string } }).env.VITE_API_URL || '/api'
    return new Promise((resolve, reject) => {
      fetch(`${baseUrl}/advisor/chat/stream`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history }),
      }).then(async (response) => {
        if (!response.ok) { reject(new Error(`HTTP ${response.status}`)); return }
        if (!response.body) { reject(new Error('No response body')); return }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const data = JSON.parse(line.slice(6))
              if (data.type === 'delta') onDelta(data.text)
              else if (data.type === 'correction') onCorrection(data.text)
              else if (data.type === 'done') resolve({ advice_id: data.advice_id, flags: data.flags, actions: data.actions ?? [] })
              else if (data.type === 'error') reject(new Error(data.message))
            } catch { /* malformed SSE line */ }
          }
        }
      }).catch(reject)
    })
  },

  listGoals: (status?: string) =>
    api.get<Goal[]>('/advisor/goals', { params: status ? { status } : undefined }).then((r) => r.data),

  createGoal: (goal: { title: string; type?: string; target_amount?: number | null; current_amount?: number; deadline?: string | null; priority?: number; notes?: string | null }) =>
    api.post<{ id: number }>('/advisor/goals', goal).then((r) => r.data),

  updateGoal: (id: number, updates: Partial<{ title: string; type: string; target_amount: number | null; current_amount: number; deadline: string | null; priority: number; status: string; notes: string | null }>) =>
    api.put<{ ok: boolean }>(`/advisor/goals/${id}`, updates).then((r) => r.data),

  deleteGoal: (id: number) =>
    api.delete<{ ok: boolean }>(`/advisor/goals/${id}`).then((r) => r.data),

  history: (limit = 20) =>
    api.get<AdviceRecord[]>('/advisor/history', { params: { limit } }).then((r) => r.data),

  reactToAdvice: (id: number, reaction: string, outcome_notes?: string) =>
    api.patch<{ ok: boolean }>(`/advisor/history/${id}/reaction`, { reaction, outcome_notes }).then((r) => r.data),

  getProfile: () =>
    api.get<UserFinancialProfile>('/advisor/profile').then((r) => r.data),

  updateProfile: (updates: Partial<Pick<UserFinancialProfile, 'life_stage' | 'risk_tolerance' | 'income_estimate' | 'communication_style'>>) =>
    api.put<{ ok: boolean }>('/advisor/profile', updates).then((r) => r.data),

  onboard: (message: string, history?: Array<{ role: 'user' | 'assistant'; content: string }>) =>
    api.post<{ response: string; completed: boolean; options: string[] }>('/advisor/onboard', { message, history: history ?? [] }).then((r) => r.data),

  tracker: () =>
    api.get<TrackerData>('/advisor/tracker').then((r) => r.data),
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cleanParams(params?: Record<string, unknown>): Record<string, string | number | boolean> | undefined {
  if (!params) return undefined
  const out: Record<string, string | number | boolean> = {}
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      out[k] = v as string | number | boolean
    }
  }
  return out
}
