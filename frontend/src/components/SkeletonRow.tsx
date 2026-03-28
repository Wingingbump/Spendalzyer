
interface SkeletonRowProps {
  cols?: number
  rows?: number
}

export default function SkeletonRow({ cols = 5, rows = 8 }: SkeletonRowProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j}>
              <div
                className="skeleton rounded"
                style={{ height: 14, width: j === 0 ? 80 : j === cols - 1 ? 60 : '80%' }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}
