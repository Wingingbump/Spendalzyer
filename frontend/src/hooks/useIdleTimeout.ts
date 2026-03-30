import { useEffect, useRef, useCallback, useState } from 'react'
import { api } from '../lib/api'

// Override via VITE_IDLE_TIMEOUT_MS in .env for testing (e.g. VITE_IDLE_TIMEOUT_MS=30000)
const TIMEOUT_MS = parseInt(import.meta.env.VITE_IDLE_TIMEOUT_MS ?? '') || 15 * 60 * 1000
// Warning shows for the last 25% of the timeout, capped at 60 seconds
const WARNING_MS = Math.min(60_000, Math.floor(TIMEOUT_MS * 0.25))
const WARNING_SECONDS = Math.floor(WARNING_MS / 1000)

export function useIdleTimeout(onLogout: () => void) {
  const [showWarning, setShowWarning] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(WARNING_SECONDS)

  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null)
  const warningShowing = useRef(false)

  const clearCountdown = () => {
    if (countdownInterval.current) {
      clearInterval(countdownInterval.current)
      countdownInterval.current = null
    }
  }

  const startCountdown = useCallback(() => {
    warningShowing.current = true
    setShowWarning(true)
    setSecondsLeft(WARNING_SECONDS)

    countdownInterval.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(countdownInterval.current!)
          countdownInterval.current = null
          onLogout()
          return 0
        }
        return s - 1
      })
    }, 1000)
  }, [onLogout])

  const resetTimer = useCallback(() => {
    if (warningShowing.current) return  // don't reset while warning is visible

    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(startCountdown, TIMEOUT_MS - WARNING_MS)
  }, [startCountdown])

  const stayActive = useCallback(() => {
    warningShowing.current = false
    setShowWarning(false)
    clearCountdown()

    // Refresh the access token so the backend session stays alive
    api.post('/auth/refresh').catch(() => {})

    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(startCountdown, TIMEOUT_MS - WARNING_MS)
  }, [startCountdown])

  useEffect(() => {
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart']
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }))

    // start the initial timer
    idleTimer.current = setTimeout(startCountdown, TIMEOUT_MS - WARNING_MS)

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer))
      if (idleTimer.current) clearTimeout(idleTimer.current)
      clearCountdown()
    }
  }, [resetTimer, startCountdown])

  return { showWarning, secondsLeft, stayActive }
}
