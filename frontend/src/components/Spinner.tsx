
interface SpinnerProps {
  size?: number
  className?: string
}

export default function Spinner({ size = 20, className = '' }: SpinnerProps) {
  return (
    <div
      className={`spinner rounded-full border-2 border-transparent ${className}`}
      style={{
        width: size,
        height: size,
        borderTopColor: 'var(--color-accent)',
        flexShrink: 0,
      }}
    />
  )
}
