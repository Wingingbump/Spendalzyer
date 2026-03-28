import Card from './Card'
import Spinner from './Spinner'

interface MetricCardProps {
  label: string
  value: string
  sub?: string
  subPositive?: boolean
  isLoading?: boolean
}

export default function MetricCard({ label, value, sub, subPositive, isLoading }: MetricCardProps) {
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
