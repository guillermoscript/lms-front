import { format, formatDistanceToNowStrict } from 'date-fns'

/**
 * "3 days ago" with the exact timestamp in the tooltip and a machine-readable
 * `dateTime`. Server-rendered, so the relative string is as fresh as the page.
 */
export function RelativeTime({
  value,
  className,
}: {
  value: string | Date | null | undefined
  className?: string
}) {
  if (!value) return <span className={className}>—</span>
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return <span className={className}>—</span>
  return (
    <time
      dateTime={date.toISOString()}
      title={format(date, 'PPpp')}
      className={className}
    >
      {formatDistanceToNowStrict(date, { addSuffix: true })}
    </time>
  )
}
