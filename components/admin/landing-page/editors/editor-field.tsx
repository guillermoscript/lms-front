import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

interface FieldProps {
  label: string
  hint?: string
  className?: string
}

export function EditorField({
  label,
  hint,
  className,
  children,
}: FieldProps & { children: React.ReactNode }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-sm font-medium">{label}</Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  )
}

export function TextField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  className,
}: FieldProps & {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <EditorField label={label} hint={hint} className={className}>
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </EditorField>
  )
}

export function TextareaField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  rows = 3,
  className,
}: FieldProps & {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <EditorField label={label} hint={hint} className={className}>
      <Textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
      />
    </EditorField>
  )
}
