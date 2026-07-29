'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import * as diff from 'diff'
import { cn } from '@/lib/utils'
import {
  IconArrowLeft,
  IconChevronDown,
  IconEqual,
  IconArrowsDiff,
  IconPlus,
  IconMinus,
} from '@tabler/icons-react'

const DIFF_NS = 'dashboard.teacher.versionHistory.diff'

/** null, undefined and '' all mean "not set" here. Comparing them raw reported
 *  phantom changes and printed the literal string "null" as the old value. */
function asText(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)
}

/**
 * A lesson snapshot carries the AI task twice: the `ai_task` row the student
 * runtime actually serves, and the legacy `lessons.ai_task_*` columns, which
 * only a version restore ever writes. Diffing the legacy pair reported changes
 * against a prompt that was never live. Wherever the row is present it wins.
 */
function normalizeSnapshot(snapshot: Record<string, unknown>): Record<string, unknown> {
  if (!('ai_task' in snapshot)) return snapshot
  const task = snapshot.ai_task as Record<string, unknown> | null
  return {
    ...snapshot,
    ai_task_description: task?.task_instructions ?? null,
    ai_task_instructions: task?.system_prompt ?? null,
  }
}

/** Snapshot keys that have a translated label; anything else is title-cased. */
type FieldKey =
  | 'title' | 'description' | 'content' | 'video_url'
  | 'ai_task_description' | 'ai_task_instructions'
  | 'duration' | 'questions' | 'instructions' | 'exercise_type'
  | 'difficulty_level' | 'time_limit' | 'name'
  | 'task_description_template' | 'system_prompt_template' | 'variables'

interface VersionDiffPanelProps {
  versionNumber: number
  versionDate: string
  oldSnapshot: Record<string, unknown>
  newSnapshot: Record<string, unknown>
  contentType: string
  onBack: () => void
  embedded?: boolean
}

function DiffStats({ additions, deletions }: { additions: number; deletions: number }) {
  return (
    <div className="flex items-center gap-3 text-xs font-medium">
      <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
        <IconPlus aria-hidden="true" className="h-3.5 w-3.5" />
        {additions}
      </span>
      <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
        <IconMinus aria-hidden="true" className="h-3.5 w-3.5" />
        {deletions}
      </span>
    </div>
  )
}

function LineDiff({ oldText, newText }: { oldText: string; newText: string }) {
  // diffLines treats a final line with and without its newline as different
  // tokens, so appending text reported the untouched last line as replaced.
  const withEol = (s: string) => (s && !s.endsWith('\n') ? s + '\n' : s)
  const diffs = diff.diffLines(withEol(oldText || ''), withEol(newText || ''))
  const additions = diffs.filter(d => d.added).reduce((sum, d) => sum + (d.count || 0), 0)
  const deletions = diffs.filter(d => d.removed).reduce((sum, d) => sum + (d.count || 0), 0)

  let oldLineNum = 0
  let newLineNum = 0

  return (
    <div className="space-y-2">
      <DiffStats additions={additions} deletions={deletions} />
      <div className="font-mono text-[12px] leading-[1.6] rounded-lg border bg-[#1e1e2e] overflow-hidden">
        {diffs.map((part, i) => {
          const lines = part.value.split('\n').filter((_, idx, arr) =>
            idx < arr.length - 1 || arr[idx] !== ''
          )

          return lines.map((line, lineIdx) => {
            let leftNum = ''
            let rightNum = ''

            if (part.removed) {
              oldLineNum++
              leftNum = String(oldLineNum)
            } else if (part.added) {
              newLineNum++
              rightNum = String(newLineNum)
            } else {
              oldLineNum++
              newLineNum++
              leftNum = String(oldLineNum)
              rightNum = String(newLineNum)
            }

            return (
              <div
                key={`${i}-${lineIdx}`}
                className={cn(
                  'flex border-b border-white/5 last:border-b-0',
                  part.added
                    ? 'bg-emerald-500/10'
                    : part.removed
                    ? 'bg-red-500/10'
                    : 'bg-transparent'
                )}
              >
                {/* Line numbers */}
                <div className="flex shrink-0 select-none text-[#585b70] border-r border-white/5">
                  <span className="w-10 px-2 text-right tabular-nums">{leftNum}</span>
                  <span className="w-10 px-2 text-right tabular-nums border-l border-white/5">{rightNum}</span>
                </div>
                {/* Change indicator */}
                <div className={cn(
                  'w-7 flex items-center justify-center shrink-0 font-bold text-xs',
                  part.added
                    ? 'text-emerald-400 bg-emerald-500/15'
                    : part.removed
                    ? 'text-red-400 bg-red-500/15'
                    : 'text-[#585b70]'
                )}>
                  {part.added ? '+' : part.removed ? '-' : ' '}
                </div>
                {/* Content */}
                <div className={cn(
                  'flex-1 px-4 py-0.5 whitespace-pre-wrap break-all',
                  part.added
                    ? 'text-emerald-300'
                    : part.removed
                    ? 'text-red-300'
                    : 'text-[#cdd6f4]'
                )}>
                  {line || ' '}
                </div>
              </div>
            )
          })
        })}
      </div>
    </div>
  )
}

function InlineValueDiff({ oldVal, newVal }: { oldVal: string; newVal: string }) {
  const t = useTranslations(DIFF_NS)
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {t('version')}
          </span>
        </div>
        <div className="p-4 rounded-lg bg-red-500/5 border border-red-500/20 text-sm">
          <span className="line-through opacity-70">{oldVal || t('empty')}</span>
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {t('current')}
          </span>
        </div>
        <div className="p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-sm">
          {newVal || t('empty')}
        </div>
      </div>
    </div>
  )
}

function DiffFieldSection({
  label,
  oldVal,
  newVal,
  isLong = false,
  defaultOpen = true,
}: {
  label: string
  oldVal: unknown
  newVal: unknown
  isLong?: boolean
  defaultOpen?: boolean
}) {
  const t = useTranslations(DIFF_NS)
  const [open, setOpen] = React.useState(defaultOpen)

  const oldStr = asText(oldVal)
  const newStr = asText(newVal)

  if (oldStr === newStr) return null

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between p-3.5 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-left group outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
        <div className="flex items-center gap-2.5">
          <IconArrowsDiff aria-hidden="true" className="h-4 w-4 text-amber-500" />
          <span className="font-semibold text-sm">{label}</span>
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
            {t('changed')}
          </span>
        </div>
        <IconChevronDown
          aria-hidden="true"
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180'
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3 pb-1">
        {isLong ? (
          <LineDiff oldText={oldStr} newText={newStr} />
        ) : (
          <InlineValueDiff oldVal={oldStr} newVal={newStr} />
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

function UnchangedFieldSection({ label, value }: { label: string; value: unknown }) {
  const t = useTranslations(DIFF_NS)
  const displayVal = asText(value) || t('empty')
  const truncated = displayVal.length > 100 ? displayVal.slice(0, 100) + '...' : displayVal

  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg border border-dashed text-muted-foreground">
      <IconEqual aria-hidden="true" className="h-4 w-4 shrink-0 opacity-50" />
      <span className="text-sm font-medium">{label}</span>
      <span className="text-xs truncate flex-1 text-right opacity-50 font-mono">{truncated}</span>
    </div>
  )
}

export function VersionDiffPanel({
  versionNumber,
  versionDate,
  oldSnapshot: rawOldSnapshot,
  newSnapshot: rawNewSnapshot,
  contentType,
  onBack,
  embedded = false,
}: VersionDiffPanelProps) {
  const t = useTranslations(DIFF_NS)
  const [showUnchanged, setShowUnchanged] = React.useState(false)

  const oldSnapshot = React.useMemo(() => normalizeSnapshot(rawOldSnapshot), [rawOldSnapshot])
  const newSnapshot = React.useMemo(() => normalizeSnapshot(rawNewSnapshot), [rawNewSnapshot])

  const getFields = React.useCallback((): { key: string; label: string; isLong?: boolean }[] => {
    const field = (key: FieldKey, isLong?: boolean) => ({
      key,
      label: t(`fields.${key}` as `fields.${FieldKey}`),
      isLong,
    })

    switch (contentType) {
      case 'lesson':
        return [
          field('title'),
          field('description'),
          field('content', true),
          field('video_url'),
          field('ai_task_description', true),
          field('ai_task_instructions', true),
        ]
      case 'exam':
        return [
          field('title'),
          field('description'),
          field('duration'),
          field('questions', true),
        ]
      case 'exercise':
        return [
          field('title'),
          field('description'),
          field('instructions', true),
          field('exercise_type'),
          field('difficulty_level'),
          field('time_limit'),
        ]
      case 'prompt_template':
        return [
          field('name'),
          field('description'),
          field('task_description_template', true),
          field('system_prompt_template', true),
          field('variables', true),
        ]
      default:
        return Object.keys({ ...oldSnapshot, ...newSnapshot }).map(k => ({
          key: k,
          label: k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        }))
    }
  }, [contentType, oldSnapshot, newSnapshot, t])

  const fields = getFields()

  const changedFields = fields.filter(f =>
    asText(oldSnapshot[f.key]) !== asText(newSnapshot[f.key])
  )

  const unchangedFields = fields.filter(f =>
    asText(oldSnapshot[f.key]) === asText(newSnapshot[f.key]) &&
    (oldSnapshot[f.key] !== undefined || newSnapshot[f.key] !== undefined)
  )

  const totalChanges = changedFields.length

  const renderContent = () => (
    <div className="space-y-3">
      {totalChanges === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center">
            <IconEqual aria-hidden="true" className="h-8 w-8 text-muted-foreground/40" />
          </div>
          <div className="space-y-1.5">
            <p className="text-base font-semibold">{t('noDiffTitle')}</p>
            <p className="text-sm text-muted-foreground">{t('noDiffBody')}</p>
          </div>
        </div>
      ) : (
        <>
          {changedFields.map((f, idx) => (
            <DiffFieldSection
              key={f.key}
              label={f.label}
              oldVal={oldSnapshot[f.key]}
              newVal={newSnapshot[f.key]}
              isLong={f.isLong}
              defaultOpen={idx < 3}
            />
          ))}

          {unchangedFields.length > 0 && (
            <div className="pt-4">
              <button
                onClick={() => setShowUnchanged(!showUnchanged)}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors outline-none focus-visible:underline"
              >
                <IconChevronDown
                  aria-hidden="true"
                  className={cn(
                    'h-3.5 w-3.5 transition-transform duration-200',
                    showUnchanged && 'rotate-180'
                  )}
                />
                {showUnchanged
                  ? t('hideUnchanged', { count: unchangedFields.length })
                  : t('showUnchanged', { count: unchangedFields.length })}
              </button>

              {showUnchanged && (
                <div className="mt-3 space-y-2">
                  {unchangedFields.map(f => (
                    <UnchangedFieldSection
                      key={f.key}
                      label={f.label}
                      value={newSnapshot[f.key]}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )

  if (embedded) {
    return (
      <div className="flex flex-col">
        {/* Legend */}
        <div className="pb-4 flex items-center gap-4 text-[11px]">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-red-500/20 border border-red-500/40" />
            <span className="text-muted-foreground">{t('removed')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-emerald-500/20 border border-emerald-500/40" />
            <span className="text-muted-foreground">{t('added')}</span>
          </div>
          <div className="ml-auto text-muted-foreground">
            {t('changes', { count: totalChanges })}
          </div>
        </div>
        {renderContent()}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 border-b bg-muted/30">
        <div className="p-5">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="gap-1.5 -ml-2 mb-3 text-muted-foreground hover:text-foreground"
          >
            <IconArrowLeft aria-hidden="true" className="h-4 w-4" />
            {t('back')}
          </Button>

          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                {t('heading')}
                <Badge variant="outline" className="font-mono text-xs">
                  v{versionNumber}
                </Badge>
              </h3>
              <p className="text-xs text-muted-foreground">
                {t('versusCurrent', { date: versionDate })}
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold tabular-nums">{totalChanges}</div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {t('changesLabel', { count: totalChanges })}
              </div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="px-5 pb-3 flex items-center gap-4 text-[11px]">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-red-500/20 border border-red-500/40" />
            <span className="text-muted-foreground">{t('removed')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-emerald-500/20 border border-emerald-500/40" />
            <span className="text-muted-foreground">{t('added')}</span>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-5">
          {renderContent()}
        </div>
      </ScrollArea>
    </div>
  )
}
