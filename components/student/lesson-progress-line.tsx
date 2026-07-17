import { Progress } from '@/components/ui/progress'

interface LessonProgressLineProps {
  completed: number
  total: number
  label: string
}

export function LessonProgressLine({ completed, total, label }: LessonProgressLineProps) {
  if (total === 0) return null
  const percent = Math.round((completed / total) * 100)

  return (
    <Progress
      value={percent}
      aria-label={label}
      title={label}
      className="shrink-0 gap-0 [&_[data-slot=progress-track]]:rounded-none"
    />
  )
}
