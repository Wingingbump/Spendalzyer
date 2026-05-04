import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import type { UseFormRegisterReturn } from 'react-hook-form'

interface PasswordInputProps {
  registerProps: UseFormRegisterReturn
  autoComplete: string
  fontSize?: number
}

export default function PasswordInput({ registerProps, autoComplete, fontSize = 14 }: PasswordInputProps) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <input
        {...registerProps}
        type={show ? 'text' : 'password'}
        placeholder="••••••••"
        autoComplete={autoComplete}
        className="w-full"
        style={{ fontSize, paddingRight: 36 }}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        tabIndex={-1}
        style={{
          position: 'absolute',
          right: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--color-text-muted)',
          padding: 4,
          display: 'flex',
          alignItems: 'center',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  )
}
