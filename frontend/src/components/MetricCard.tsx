import Card from './Card'
import Spinner from './Spinner'

interface MetricCardProps {
  label: string
  value: string
  sub?: string
  subPositive?: boolean
  isLoading?: boolean
  hero?: boolean
}

export default function MetricCard({ label, value, sub, subPositive, isLoading, hero }: MetricCardProps) {
  if (hero) {
    return (
      <div
        className="rounded-xl p-4 relative overflow-hidden"
        style={{ background: 'var(--color-accent)' }}
      >
        {/* subtle glare */}
        <div style={{ position: 'absolute', right: -16, top: -16, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', filter: 'blur(20px)', pointerEvents: 'none' }} />
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
          {label}
        </p>
        {isLoading ? (
          <Spinner size={20} />
        ) : (
          <>
            <p style={{ fontSize: 26, fontWeight: 700, fontFamily: 'ui-monospace, monospace', color: '#fff', lineHeight: 1.1 }}>
              {value}
            </p>
            {sub && (
              <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.15)', fontSize: 11, color: '#fff', fontWeight: 600 }}>
                {sub}
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <Card>
      <p style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
        {label}
      </p>
      {isLoading ? (
        <Spinner size={20} />
      ) : (
        <>
          <p style={{ fontSize: 26, fontWeight: 700, fontFamily: 'ui-monospace, monospace', color: 'var(--color-text-primary)', lineHeight: 1.1 }}>
            {value}
          </p>
          {sub && (
            <p
              className="mt-1"
              style={{
                fontSize: 12,
                color: subPositive === undefined
                  ? 'var(--color-text-muted)'
                  : subPositive
                    ? 'var(--color-positive)'
                    : 'var(--color-negative)',
              }}
            >
              {sub}
            </p>
          )}
        </>
      )}
    </Card>
  )
}
