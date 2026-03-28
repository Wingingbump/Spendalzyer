import React from 'react'
import Sidebar from './Sidebar'
import RightPanel from './RightPanel'
import { useAuth } from '../context/AuthContext'
import { useIdleTimeout } from '../hooks/useIdleTimeout'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const { logout } = useAuth()
  const { showWarning, secondsLeft, stayActive } = useIdleTimeout(logout)

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <Sidebar />
      <main
        className="flex-1 overflow-auto"
        style={{
          marginLeft: 220,
          marginRight: 300,
          minHeight: '100vh',
          filter: showWarning ? 'blur(6px)' : 'none',
          transition: 'filter 0.3s ease',
          pointerEvents: showWarning ? 'none' : 'auto',
        }}
      >
        <div className="p-6">
          {children}
        </div>
      </main>
      <RightPanel />

      {showWarning && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ zIndex: 100, background: 'rgba(0,0,0,0.4)' }}
        >
          <div
            className="rounded-2xl p-8 flex flex-col items-center"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              width: 340,
              textAlign: 'center',
            }}
          >
            {/* Countdown ring */}
            <div
              className="flex items-center justify-center rounded-full mb-5"
              style={{
                width: 72,
                height: 72,
                background: 'var(--color-surface-raise)',
                border: `3px solid ${secondsLeft <= 15 ? 'var(--color-negative)' : 'var(--color-border)'}`,
                transition: 'border-color 0.3s',
              }}
            >
              <span
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  fontFamily: 'monospace',
                  color: secondsLeft <= 15 ? 'var(--color-negative)' : 'var(--color-text-primary)',
                  transition: 'color 0.3s',
                }}
              >
                {secondsLeft}
              </span>
            </div>

            <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 8 }}>
              Still there?
            </h2>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 24, lineHeight: 1.5 }}>
              You've been inactive for a while. We'll sign you out in{' '}
              <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                {secondsLeft} second{secondsLeft !== 1 ? 's' : ''}
              </span>{' '}
              to keep your data safe.
            </p>

            <div className="flex gap-3 w-full">
              <button
                onClick={logout}
                className="flex-1 py-2 rounded-lg font-medium"
                style={{
                  background: 'var(--color-surface-raise)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-muted)',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Sign out
              </button>
              <button
                onClick={stayActive}
                className="flex-1 py-2 rounded-lg font-semibold"
                style={{
                  background: 'var(--color-accent)',
                  color: '#000',
                  fontSize: 13,
                  cursor: 'pointer',
                  border: 'none',
                }}
              >
                I'm still here
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
