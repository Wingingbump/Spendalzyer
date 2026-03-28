import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { authApi } from '../lib/api'
import { useAuth } from '../context/AuthContext'

const schema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
})

const resetSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  new_password: z.string().min(1, 'New password is required'),
  reset_secret: z.string().min(1, 'Reset secret is required'),
})

type FormData = z.infer<typeof schema>
type ResetFormData = z.infer<typeof resetSchema>

export default function Login() {
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [showReset, setShowReset] = useState(false)
  const [serverError, setServerError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const navigate = useNavigate()
  const { setUser } = useAuth()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const {
    register: registerReset,
    handleSubmit: handleResetSubmit,
    formState: { errors: resetErrors },
    reset: resetResetForm,
  } = useForm<ResetFormData>({
    resolver: zodResolver(resetSchema),
  })

  const onSubmit = async (data: FormData) => {
    setServerError('')
    setIsSubmitting(true)
    try {
      const user = tab === 'login'
        ? await authApi.login(data.username, data.password)
        : await authApi.register(data.username, data.password)
      setUser(user)
      navigate('/overview', { replace: true })
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } }
      setServerError(
        axiosErr.response?.data?.detail ||
        (tab === 'login' ? 'Invalid username or password' : 'Registration failed')
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const onReset = async (data: ResetFormData) => {
    setServerError('')
    setSuccessMsg('')
    setIsSubmitting(true)
    try {
      await authApi.resetPassword(data.username, data.new_password, data.reset_secret)
      setSuccessMsg('Password reset — you can now sign in.')
      resetResetForm()
      setTimeout(() => { setShowReset(false); setSuccessMsg('') }, 2000)
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } }
      setServerError(axiosErr.response?.data?.detail || 'Reset failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  const closeReset = () => {
    setShowReset(false)
    setServerError('')
    setSuccessMsg('')
    resetResetForm()
  }

  return (
    <div
      className="min-h-screen flex items-start justify-center"
      style={{ background: 'var(--color-bg)', paddingTop: '10vh' }}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <span style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--color-text-primary)' }}>
            spend<span style={{ color: 'var(--color-accent)' }}>.</span>
          </span>
          <p className="mt-2" style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            personal finance, your way
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-6"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
          }}
        >
          {/* Tabs */}
          <div
            className="flex rounded-lg p-1 mb-6"
            style={{ background: 'var(--color-surface-raise)' }}
          >
            {(['login', 'register'] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setServerError('') }}
                className="flex-1 py-2 rounded-md text-sm font-medium transition-all"
                style={{
                  background: tab === t ? 'var(--color-surface)' : 'transparent',
                  color: tab === t ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                  border: tab === t ? '1px solid var(--color-border)' : '1px solid transparent',
                  fontSize: 13,
                }}
              >
                {t === 'login' ? 'Sign in' : 'Register'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label
                className="block mb-1.5"
                style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 500 }}
              >
                Username
              </label>
              <input
                {...register('username')}
                type="text"
                placeholder="Username"
                autoComplete="username"
                className="w-full"
                style={{ fontSize: 14 }}
              />
              {errors.username && (
                <p className="mt-1" style={{ fontSize: 11, color: 'var(--color-negative)' }}>
                  {errors.username.message}
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                  Password
                </label>
                {tab === 'login' && (
                  <button
                    type="button"
                    onClick={() => { setShowReset(true); setServerError('') }}
                    style={{ fontSize: 12, color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                {...register('password')}
                type="password"
                placeholder="••••••••"
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                className="w-full"
                style={{ fontSize: 14 }}
              />
              {errors.password && (
                <p className="mt-1" style={{ fontSize: 11, color: 'var(--color-negative)' }}>
                  {errors.password.message}
                </p>
              )}
            </div>

            {serverError && (
              <div
                className="rounded-lg px-3 py-2"
                style={{
                  background: 'rgba(232, 96, 96, 0.1)',
                  border: '1px solid rgba(232, 96, 96, 0.3)',
                  color: 'var(--color-negative)',
                  fontSize: 12,
                }}
              >
                {serverError}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 rounded-lg font-semibold transition-opacity disabled:opacity-60"
              style={{
                background: 'var(--color-accent)',
                color: '#000',
                fontSize: 14,
                marginTop: 8,
              }}
            >
              {isSubmitting
                ? (tab === 'login' ? 'Signing in…' : 'Creating account…')
                : (tab === 'login' ? 'Sign in' : 'Create account')
              }
            </button>
          </form>
        </div>
      </div>

      {/* Reset password modal */}
      {showReset && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.5)', zIndex: 50 }}
          onClick={(e) => { if (e.target === e.currentTarget) closeReset() }}
        >
          <div
            className="rounded-2xl p-6 w-full"
            style={{
              maxWidth: 360,
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
            }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>
              Reset password
            </h2>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 20 }}>
              Enter your username, a new password, and your reset secret from the server config.
            </p>

            <form onSubmit={handleResetSubmit(onReset)} className="space-y-4">
              <div>
                <label className="block mb-1.5" style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                  Username
                </label>
                <input
                  {...registerReset('username')}
                  type="text"
                  placeholder="Username"
                  autoComplete="username"
                  className="w-full"
                  style={{ fontSize: 14 }}
                />
                {resetErrors.username && (
                  <p className="mt-1" style={{ fontSize: 11, color: 'var(--color-negative)' }}>{resetErrors.username.message}</p>
                )}
              </div>
              <div>
                <label className="block mb-1.5" style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                  New password
                </label>
                <input
                  {...registerReset('new_password')}
                  type="password"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="w-full"
                  style={{ fontSize: 14 }}
                />
                {resetErrors.new_password && (
                  <p className="mt-1" style={{ fontSize: 11, color: 'var(--color-negative)' }}>{resetErrors.new_password.message}</p>
                )}
              </div>
              <div>
                <label className="block mb-1.5" style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                  Reset secret
                </label>
                <input
                  {...registerReset('reset_secret')}
                  type="password"
                  placeholder="from your .env"
                  className="w-full"
                  style={{ fontSize: 14 }}
                />
                {resetErrors.reset_secret && (
                  <p className="mt-1" style={{ fontSize: 11, color: 'var(--color-negative)' }}>{resetErrors.reset_secret.message}</p>
                )}
              </div>

              {serverError && (
                <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(232, 96, 96, 0.1)', border: '1px solid rgba(232, 96, 96, 0.3)', color: 'var(--color-negative)', fontSize: 12 }}>
                  {serverError}
                </div>
              )}
              {successMsg && (
                <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(90, 191, 138, 0.1)', border: '1px solid rgba(90, 191, 138, 0.3)', color: 'var(--color-positive)', fontSize: 12 }}>
                  {successMsg}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeReset}
                  className="flex-1 py-2 rounded-lg font-medium"
                  style={{ background: 'var(--color-surface-raise)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', fontSize: 13 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2 rounded-lg font-semibold transition-opacity disabled:opacity-60"
                  style={{ background: 'var(--color-accent)', color: '#000', fontSize: 13 }}
                >
                  {isSubmitting ? 'Resetting…' : 'Reset password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
