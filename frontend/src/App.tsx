import React, { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Spinner from './components/Spinner'

const Login = lazy(() => import('./pages/Login'))
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const Overview = lazy(() => import('./pages/Overview'))
const Transactions = lazy(() => import('./pages/Transactions'))
const Ledger = lazy(() => import('./pages/Ledger'))
const Merchants = lazy(() => import('./pages/Merchants'))
const Categories = lazy(() => import('./pages/Categories'))
const Settings = lazy(() => import('./pages/Settings'))
const Canvas = lazy(() => import('./pages/Canvas'))
const Advisor = lazy(() => import('./pages/Advisor'))
const Tracker = lazy(() => import('./pages/Tracker'))

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: 'var(--color-bg)' }}>
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-8 h-8 rounded-full border-2 border-transparent spinner"
            style={{ borderTopColor: 'var(--color-accent)' }}
          />
          <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Loading…</span>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <Layout>{children}</Layout>
}

function RootRedirect() {
  const { user, isLoading } = useAuth()
  if (isLoading) return null
  return <Navigate to={user ? '/overview' : '/login'} replace />
}

const PageFallback = () => (
  <div className="flex items-center justify-center min-h-screen" style={{ background: 'var(--color-bg)' }}>
    <Spinner />
  </div>
)

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<Login />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route
          path="/overview"
          element={
            <ProtectedRoute>
              <Overview />
            </ProtectedRoute>
          }
        />
        <Route
          path="/transactions"
          element={
            <ProtectedRoute>
              <Transactions />
            </ProtectedRoute>
          }
        />
        <Route
          path="/ledger"
          element={
            <ProtectedRoute>
              <Ledger />
            </ProtectedRoute>
          }
        />
        <Route
          path="/merchants"
          element={
            <ProtectedRoute>
              <Merchants />
            </ProtectedRoute>
          }
        />
        <Route
          path="/categories"
          element={
            <ProtectedRoute>
              <Categories />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/canvas"
          element={
            <ProtectedRoute>
              <Canvas />
            </ProtectedRoute>
          }
        />
        <Route
          path="/advisor"
          element={
            <ProtectedRoute>
              <Advisor />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tracker"
          element={
            <ProtectedRoute>
              <Tracker />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
