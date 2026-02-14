'use client'

import * as React from 'react'
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

interface VersionDiffPanelProps {
  versionNumber: number
  versionDate: string
  oldSnapshot: Record<string, any>
  newSnapshot: Record<string, any>
  contentType: string
  onBack: () => void
  /** When embedded in a parent container, hides the header and back button */
  embedded?: boolean
}

function DiffStats({ additions, deletions }: { additions: number; deletions: number }) {
  return (
    <div className="flex items-center gap-3 text-xs font-medium">
      <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
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
  const diffs = diff.diffLines(oldText || '', newText || '')
  const additions = diffs.filter(d => d.added).reduce((sum, d) => sum + (d.count || 0), 0)
  const deletions = diffs.filter(d => d.removed).reduce((sum, d) => sum + (d.count || 0), 0)

  let oldLineNum = 0
  let newLineNum = 0

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <DiffStats additions={additions} deletions={deletions} />
      </div>
      <div className="font-mono text-[11px] leading-relaxed rounded-lg border bg-muted/20 overflow-hidden">
        {diffs.map((part, i) => {
          const lines = part.value.split('\n').filter((_, idx, arr) => 
            // Keep all lines except trailing empty one
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
                  'flex border-b last:border-b-0',
                  part.added
                    ? 'bg-green-500/10'
                    : part.removed
                    ? 'bg-red-500/10'
                    : 'bg-transparent'
                )}
              >
                {/* Line numbers */}
                <div className="flex shrink-0 select-none text-muted-foreground/50 border-r bg-muted/30">
                  <span className="w-8 px-1 text-right tabular-nums">{leftNum}</span>
                  <span className="w-8 px-1 text-right tabular-nums border-l">{rightNum}</span>
                </div>
                {/* Change indicator */}
                <div className={cn(
                  'w-6 flex items-center justify-center shrink-0 font-bold',
                  part.added
                    ? 'text-green-600 dark:text-green-400 bg-green-500/20'
                    : part.removed
                    ? 'text-red-600 dark:text-red-400 bg-red-500/20'
                    : 'text-muted-foreground/30'
                )}>
                  {part.added ? '+' : part.removed ? '-' : ' '}
                </div>
                {/* Content */}
                <div className="flex-1 px-3 py-0.5 whitespace-pre-wrap break-all">
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
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Version
          </span>
        </div>
        <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20 text-sm">
          <span className="line-through opacity-70">{oldVal || '(empty)'}</span>
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Current
          </span>
        </div>
        <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/20 text-sm">
          {newVal || '(empty)'}
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
  oldVal: any
  newVal: any
  isLong?: boolean
  defaultOpen?: boolean
}) {
  const [open, setOpen] = React.useState(defaultOpen)
  const hasChanged = JSON.stringify(oldVal) !== JSON.stringify(newVal)

  if (!hasChanged) return null

  const oldStr = typeof oldVal === 'object' ? JSON.stringify(oldVal, null, 2) : String(oldVal || '')
  const newStr = typeof newVal === 'object' ? JSON.stringify(newVal, null, 2) : String(newVal || '')

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-left group outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
        <div className="flex items-center gap-2">
          <IconArrowsDiff aria-hidden="true" className="h-4 w-4 text-amber-500" />
          <span className="font-semibold text-sm">{label}</span>
          <Badge variant="secondary" className="text-[10px] font-medium">Changed</Badge>
        </div>
        <IconChevronDown
          aria-hidden="true"
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180'
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3 pb-1 animate-in fade-in slide-in-from-top-2 duration-200">
        {isLong ? (
          <LineDiff oldText={oldStr} newText={newStr} />
        ) : (
          <InlineValueDiff oldVal={oldStr} newVal={newStr} />
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

function UnchangedFieldSection({ label, value }: { label: string; value: any }) {
  const displayVal = typeof value === 'object' ? JSON.stringify(value) : String(value || '(empty)')
  const truncated = displayVal.length > 80 ? displayVal.slice(0, 80) + '...' : displayVal
  
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-dashed text-muted-foreground">
      <IconEqual aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span className="text-sm font-medium">{label}</span>
      <span className="text-xs truncate flex-1 text-right opacity-60">{truncated}</span>
    </div>
  )
}

export function VersionDiffPanel({
  versionNumber,
  versionDate,
  oldSnapshot,
  newSnapshot,
  contentType,
  onBack,
  embedded = false,
}: VersionDiffPanelProps) {
  const [showUnchanged, setShowUnchanged] = React.useState(false)

  // Define which fields to compare based on content type
  const getFields = React.useCallback(() => {
    switch (contentType) {
      case 'lesson':
        return [
          { key: 'title', label: 'Title' },
          { key: 'description', label: 'Description' },
          { key: 'content', label: 'Content', isLong: true },
          { key: 'video_url', label: 'Video URL' },
          { key: 'ai_task_description', label: 'AI Task Prompt', isLong: true },
          { key: 'ai_task_instructions', label: 'AI Grading Instructions', isLong: true },
        ]
      case 'exam':
        return [
          { key: 'title', label: 'Title' },
          { key: 'description', label: 'Description' },
          { key: 'duration', label: 'Duration (minutes)' },
          { key: 'questions', label: 'Questions', isLong: true },
        ]
      case 'exercise':
        return [
          { key: 'title', label: 'Title' },
          { key: 'description', label: 'Description' },
          { key: 'instructions', label: 'Instructions', isLong: true },
          { key: 'exercise_type', label: 'Type' },
          { key: 'difficulty_level', label: 'Difficulty' },
          { key: 'time_limit', label: 'Time Limit' },
        ]
      case 'prompt_template':
        return [
          { key: 'name', label: 'Name' },
          { key: 'description', label: 'Description' },
          { key: 'task_description_template', label: 'Task Template', isLong: true },
          { key: 'system_prompt_template', label: 'System Template', isLong: true },
          { key: 'variables', label: 'Variables', isLong: true },
        ]
      default:
        return Object.keys({ ...oldSnapshot, ...newSnapshot }).map(k => ({ 
          key: k, 
          label: k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        }))
    }
  }, [contentType, oldSnapshot, newSnapshot])

  const fields = getFields()
  
  const changedFields = fields.filter(f => 
    JSON.stringify(oldSnapshot[f.key]) !== JSON.stringify(newSnapshot[f.key])
  )
  
  const unchangedFields = fields.filter(f => 
    JSON.stringify(oldSnapshot[f.key]) === JSON.stringify(newSnapshot[f.key]) &&
    (oldSnapshot[f.key] !== undefined || newSnapshot[f.key] !== undefined)
  )

  const totalChanges = changedFields.length

  return (
    <div className={cn("flex flex-col", !embedded && "h-full")}>
      {/* Header - only shown when not embedded */}
      {!embedded && (
        <div className="shrink-0 border-b bg-muted/30">
          <div className="p-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="gap-1.5 -ml-2 mb-3 text-muted-foreground hover:text-foreground"
            >
              <IconArrowLeft aria-hidden="true" className="h-4 w-4" />
              Back to History
            </Button>
            
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  Comparing Changes
                  <Badge variant="outline" className="font-mono text-xs">
                    v{versionNumber}
                  </Badge>
                </h3>
                <p className="text-xs text-muted-foreground">
                  {versionDate} vs Current State
                </p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold tabular-nums">{totalChanges}</div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {totalChanges === 1 ? 'Change' : 'Changes'}
                </div>
              </div>
            </div>
          </div>
          
          {/* Legend */}
          <div className="px-4 pb-3 flex items-center gap-4 text-[11px]">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-red-500/20 border border-red-500/40" />
              <span className="text-muted-foreground">Removed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-green-500/20 border border-green-500/40" />
              <span className="text-muted-foreground">Added</span>
            </div>
          </div>
        </div>
      )}

      {/* Legend for embedded mode */}
      {embedded && (
        <div className="pb-4 flex items-center gap-4 text-[11px]">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-red-500/20 border border-red-500/40" />
            <span className="text-muted-foreground">Removed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-green-500/20 border border-green-500/40" />
            <span className="text-muted-foreground">Added</span>
          </div>
          <div className="ml-auto text-muted-foreground">
            <span className="font-bold tabular-nums text-foreground">{totalChanges}</span> {totalChanges === 1 ? 'change' : 'changes'}
          </div>
        </div>
      )}

      {/* Content */}
      {embedded ? (
        <div className="space-y-3">
          {totalChanges === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <IconEqual aria-hidden="true" className="h-6 w-6 text-muted-foreground/60" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold">No differences found</p>
                <p className="text-xs text-muted-foreground">
                  This version is identical to the current state.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Changed fields */}
              {changedFields.map((f, idx) => (
                <DiffFieldSection
                  key={f.key}
                  label={f.label}
                  oldVal={oldSnapshot[f.key]}
                  newVal={newSnapshot[f.key]}
                  isLong={f.isLong}
                  defaultOpen={idx < 3} // First 3 open by default
                />
              ))}

              {/* Unchanged fields toggle */}
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
                    {showUnchanged ? 'Hide' : 'Show'} {unchangedFields.length} unchanged {unchangedFields.length === 1 ? 'field' : 'fields'}
                  </button>
                  
                  {showUnchanged && (
                    <div className="mt-3 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
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
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-3">
            {totalChanges === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                  <IconEqual aria-hidden="true" className="h-6 w-6 text-muted-foreground/60" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold">No differences found</p>
                  <p className="text-xs text-muted-foreground">
                    This version is identical to the current state.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Changed fields */}
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

                {/* Unchanged fields toggle */}
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
                      {showUnchanged ? 'Hide' : 'Show'} {unchangedFields.length} unchanged {unchangedFields.length === 1 ? 'field' : 'fields'}
                    </button>
                    
                    {showUnchanged && (
                      <div className="mt-3 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
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
        </ScrollArea>
      )}
    </div>
  )
}
