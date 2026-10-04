'use client'

import {
  createContext,
  useContext,
  useId,
  useState,
  useTransition,
  type ReactNode
} from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import { IconDotsVertical } from '@tabler/icons-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem
} from '@/components/ui/select'

type ContentKind = 'lessons' | 'exercises' | 'exams'
type Changes = {
  status?: 'draft' | 'published' | 'archived'
  is_preview?: boolean
  difficulty_level?: 'easy' | 'medium' | 'hard'
  time_limit?: number | null
  duration?: number
  publish_at?: null
}
const SelectionContext = createContext<{
  selected: Set<number>
  pending: boolean
  toggle: (id: number, checked: boolean) => void
  setStatus: (id: number, status: 'draft' | 'published' | 'archived') => void
} | null>(null)

export function BulkContentCheckbox({
  id,
  title
}: {
  id: number
  title: string
}) {
  const selection = useContext(SelectionContext)
  const t = useTranslations('dashboard.teacher.manageCourse.bulk')
  if (!selection) return null
  return (
    <Checkbox
      className="pointer-events-auto relative"
      checked={selection.selected.has(id)}
      disabled={selection.pending}
      onCheckedChange={(checked) => selection.toggle(id, checked)}
      aria-label={t('selectItem', { title })}
    />
  )
}

export function BulkContentRowActions({
  id,
  title,
  status
}: {
  id: number
  title: string
  status: string | null
}) {
  const selection = useContext(SelectionContext)
  const t = useTranslations('dashboard.teacher.manageCourse.bulk')
  if (!selection) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" />}
        disabled={selection.pending}
        aria-label={t('actionsFor', { title })}
      >
        <IconDotsVertical />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          {status === 'archived' ? (
            <DropdownMenuItem onClick={() => selection.setStatus(id, 'draft')}>
              {t('restore')}
            </DropdownMenuItem>
          ) : (
            <>
              {status !== 'published' && (
                <DropdownMenuItem
                  onClick={() => selection.setStatus(id, 'published')}
                >
                  {t('publish')}
                </DropdownMenuItem>
              )}
              {status === 'published' && (
                <DropdownMenuItem
                  onClick={() => selection.setStatus(id, 'draft')}
                >
                  {t('draft')}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => selection.setStatus(id, 'archived')}
              >
                {t('archive')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Server-rendered rows stay intact; only selection and mutations run in the browser. */
export function BulkContentManager({
  kind,
  courseId,
  tenantId,
  ids,
  archivedIds = [],
  selectionKey = '',
  children
}: {
  kind: ContentKind
  courseId: number
  tenantId: string
  ids: number[]
  archivedIds?: number[]
  selectionKey?: string
  children: ReactNode
}) {
  const t = useTranslations('dashboard.teacher.manageCourse.bulk')
  const router = useRouter()
  const fieldId = useId()
  const [selection, setSelection] = useState<{ key: string; ids: Set<number> }>(
    { key: selectionKey, ids: new Set() }
  )
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState('unchanged')
  const [preview, setPreview] = useState('unchanged')
  const [difficulty, setDifficulty] = useState('unchanged')
  const [minutes, setMinutes] = useState('')
  // Filtering a list never applies an action to hidden rows.
  const selected = new Set(
    ids.filter((id) => selection.key === selectionKey && selection.ids.has(id))
  )
  const selectedArchived = archivedIds.filter((id) => selected.has(id))
  const selectedActive = [...selected].filter((id) => !archivedIds.includes(id))
  const all = ids.length > 0 && selected.size === ids.length

  function apply(changes: Changes, targets = [...selected]) {
    if (!targets.length || pending) return
    startTransition(async () => {
      try {
        const supabase = createClient()
        const key = kind === 'exams' ? 'exam_id' : 'id'
        const patch =
          kind === 'lessons' && changes.status
            ? { ...changes, publish_at: null }
            : changes
        const { data, error } = await supabase
          .from(kind)
          .update(patch)
          .eq('course_id', courseId)
          .eq('tenant_id', tenantId)
          .in(key, targets)
          .select(key)
        if (error) throw error
        if (!data || data.length !== targets.length) {
          toast.error(
            t('partial', { count: data?.length ?? 0, total: targets.length })
          )
          router.refresh()
          return
        }
        toast.success(t('success', { count: data.length }))
        setSelection({ key: selectionKey, ids: new Set() })
        setOpen(false)
        router.refresh()
      } catch {
        toast.error(t('error'))
      }
    })
  }

  function save() {
    const changes: Changes = {}
    if (status === 'draft' || status === 'published' || status === 'archived')
      changes.status = status
    if (kind === 'lessons' && preview !== 'unchanged')
      changes.is_preview = preview === 'yes'
    if (
      kind === 'exercises' &&
      (difficulty === 'easy' ||
        difficulty === 'medium' ||
        difficulty === 'hard')
    )
      changes.difficulty_level = difficulty
    if (kind !== 'lessons' && minutes !== '') {
      const value = Number(minutes)
      if (!Number.isSafeInteger(value) || value < (kind === 'exams' ? 1 : 0)) {
        toast.error(t('invalidMinutes'))
        return
      }
      if (kind === 'exams') changes.duration = value
      else changes.time_limit = value === 0 ? null : value
    }
    if (Object.keys(changes).length) apply(changes)
  }

  function choose(
    label: string,
    value: string,
    onChange: (value: string) => void,
    options: [string, string][]
  ) {
    const id = `${fieldId}-${label}`
    return (
      <div className="flex flex-col gap-2">
        <Label htmlFor={id}>{t(label)}</Label>
        <Select
          items={[
            { value: 'unchanged', label: t('unchanged') },
            ...options.map(([value, label]) => ({ value, label: t(label) }))
          ]}
          value={value}
          onValueChange={(next) => onChange(next ?? 'unchanged')}
        >
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="unchanged">{t('unchanged')}</SelectItem>
              {options.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {t(label)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    )
  }
  const hasChanges =
    status !== 'unchanged' ||
    (kind === 'lessons'
      ? preview !== 'unchanged'
      : minutes !== '' || (kind === 'exercises' && difficulty !== 'unchanged'))

  return (
    <SelectionContext.Provider
      value={{
        selected,
        pending,
        setStatus: (id, status) => apply({ status }, [id]),
        toggle: (id, checked) => {
          setSelection((current) => {
            const next = new Set(
              current.key === selectionKey ? current.ids : []
            )
            if (checked) next.add(id)
            else next.delete(id)
            return { key: selectionKey, ids: next }
          })
        }
      }}
    >
      <div className="flex flex-col gap-3">
        {ids.length > 0 && (
          <div
            className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-3"
            aria-busy={pending}
          >
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={all}
                indeterminate={selected.size > 0 && !all}
                disabled={pending}
                onCheckedChange={(checked) =>
                  setSelection({
                    key: selectionKey,
                    ids: checked ? new Set(ids) : new Set()
                  })
                }
              />
              {t('selectAll')}
            </label>
            <span className="text-sm text-muted-foreground" role="status">
              {pending ? t('saving') : t('selected', { count: selected.size })}
            </span>
            {selected.size > 0 && (
              <div className="flex flex-wrap gap-2 sm:ml-auto">
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => apply({ status: 'published' })}
                >
                  {t('publish')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => apply({ status: 'draft' })}
                >
                  {t('draft')}
                </Button>
                {selectedActive.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      apply({ status: 'archived' }, selectedActive)
                    }
                  >
                    {t('archive')}
                  </Button>
                )}
                {selectedArchived.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => apply({ status: 'draft' }, selectedArchived)}
                  >
                    {t('restore')}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    setStatus('unchanged')
                    setPreview('unchanged')
                    setDifficulty('unchanged')
                    setMinutes('')
                    setOpen(true)
                  }}
                >
                  {t('edit')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    setSelection({ key: selectionKey, ids: new Set() })
                  }
                >
                  {t('clear')}
                </Button>
              </div>
            )}
          </div>
        )}
        {children}
      </div>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!pending) setOpen(next)
        }}
      >
        <DialogContent showCloseButton={!pending}>
          <DialogHeader>
            <DialogTitle>
              {t('editCount', { count: selected.size })}
            </DialogTitle>
            <DialogDescription>{t('hint')}</DialogDescription>
          </DialogHeader>
          <fieldset disabled={pending} className="flex min-w-0 flex-col gap-4">
            {choose('status', status, setStatus, [
              ['published', 'published'],
              ['draft', 'draftStatus'],
              ['archived', 'archived']
            ])}
            {kind === 'lessons' &&
              choose('preview', preview, setPreview, [
                ['yes', 'previewOn'],
                ['no', 'previewOff']
              ])}
            {kind === 'exercises' &&
              choose('difficulty', difficulty, setDifficulty, [
                ['easy', 'easy'],
                ['medium', 'medium'],
                ['hard', 'hard']
              ])}
            {kind !== 'lessons' && (
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${fieldId}-minutes`}>
                  {t(kind === 'exams' ? 'duration' : 'timeLimit')}
                </Label>
                <Input
                  id={`${fieldId}-minutes`}
                  type="number"
                  min={kind === 'exams' ? 1 : 0}
                  step={1}
                  placeholder={t('unchanged')}
                  value={minutes}
                  onChange={(event) => setMinutes(event.target.value)}
                />
                {kind === 'exercises' && (
                  <p className="text-xs text-muted-foreground">
                    {t('noLimit')}
                  </p>
                )}
              </div>
            )}
          </fieldset>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              disabled={pending || !selected.size || !hasChanges}
              onClick={save}
            >
              {t(pending ? 'saving' : 'save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SelectionContext.Provider>
  )
}
