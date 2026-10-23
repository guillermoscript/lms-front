import { IconAlertTriangle } from '@tabler/icons-react'

/** Inline failure state for one dashboard widget: never a silent zero. */
export function WidgetError({ message }: { message: string }) {
  return (
    <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
      <IconAlertTriangle aria-hidden className="size-4 shrink-0" />
      {message}
    </p>
  )
}
