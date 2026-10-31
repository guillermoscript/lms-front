import { IconCircleCheck } from '@tabler/icons-react'
import { Badge } from '@/components/ui/badge'

/** Published reads as a green check; any other state stays neutral. */
export function ContentStatusBadge({ status, label }: { status: string; label: string }) {
  if (status === 'published') {
    return (
      <Badge className="h-4 gap-1 border-success/20 bg-success/15 text-[10px] text-success">
        <IconCircleCheck className="h-3 w-3" aria-hidden="true" />
        {label}
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="h-4 text-[10px]">
      {label}
    </Badge>
  )
}
