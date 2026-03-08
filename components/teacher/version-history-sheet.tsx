'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { IconHistory, IconLoader2, IconRestore, IconGitCompare, IconEye, IconClock, IconDots } from '@tabler/icons-react'
import { toast } from 'sonner'
import { VersionPreview } from './version-preview'
import { VersionDiffPanel } from './version-diff-panel'
import { cn } from '@/lib/utils'

interface ContentVersion {
  id: number
  version_number: number
  snapshot: Record<string, unknown>
  created_at: string
}

type ViewMode = 'preview' | 'diff'

interface VersionHistorySheetProps {
  contentType: 'lesson' | 'exam' | 'exercise' | 'prompt_template'
  contentId: number
  onRestore?: () => void
  currentSnapshot?: Record<string, unknown>
}

const RPC_NAMES: Record<string, string> = {
  lesson: 'restore_lesson_version',
  exam: 'restore_exam_version',
  exercise: 'restore_exercise_version',
  prompt_template: 'restore_prompt_template_version',
}

const ID_PARAMS: Record<string, string> = {
  lesson: '_lesson_id',
  exam: '_exam_id',
  exercise: '_exercise_id',
  prompt_template: '_template_id',
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Group versions by date for the timeline sidebar */
function groupByDate(versions: ContentVersion[]): { date: string; versions: ContentVersion[] }[] {
  const groups: Record<string, ContentVersion[]> = {}
  for (const v of versions) {
    const dateKey = new Date(v.created_at).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
    if (!groups[dateKey]) groups[dateKey] = []
    groups[dateKey].push(v)
  }
  return Object.entries(groups).map(([date, versions]) => ({ date, versions }))
}

export function VersionHistorySheet({ contentType, contentId, onRestore, currentSnapshot }: VersionHistorySheetProps) {
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<ContentVersion[]>([])
  const [loading, setLoading] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [selectedVersion, setSelectedVersion] = useState<ContentVersion | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('preview')
  const [confirmVersion, setConfirmVersion] = useState<number | null>(null)

  const fetchVersions = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('content_versions')
      .select('id, version_number, snapshot, created_at')
      .eq('content_type', contentType)
      .eq('content_id', contentId)
      .order('version_number', { ascending: false })
      .limit(50)

    if (error) {
      toast.error('Failed to load version history')
    } else {
      setVersions(data || [])
      if (data && data.length > 0) {
        setSelectedVersion(data[0])
      }
    }
    setLoading(false)
  }, [contentType, contentId])

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen)
    if (isOpen) {
      fetchVersions()
      setSelectedVersion(null)
      setViewMode('preview')
    }
  }

  const handleRestore = async (versionNumber: number) => {
    setRestoring(true)
    setConfirmVersion(null)
    const supabase = createClient()

    const rpcName = RPC_NAMES[contentType]
    const idParam = ID_PARAMS[contentType]

    const { error } = await supabase.rpc(rpcName, {
      [idParam]: contentId,
      _version_number: versionNumber,
    })

    if (error) {
      toast.error(`Restore failed: ${error.message}`)
    } else {
      toast.success(`Restored to version ${versionNumber}`)
      setOpen(false)
      onRestore?.()
    }
    setRestoring(false)
  }

  const dateGroups = groupByDate(versions)

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpen}>
        <DialogTrigger render={<Button variant="outline" size="sm" className="gap-2" />}>
          <IconHistory aria-hidden="true" className="h-4 w-4" />
          History
        </DialogTrigger>
        <DialogContent
          showCloseButton
          className="!max-w-[95vw] !w-[1200px] h-[90vh] max-h-[900px] p-0 flex flex-col overflow-hidden"
        >
          {/* Top bar */}
          <div className="px-6 py-4 border-b shrink-0 flex items-center justify-between bg-background">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <IconHistory aria-hidden="true" className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <DialogHeader className="p-0 space-y-0">
                  <DialogTitle className="text-base font-semibold leading-none">
                    Version History
                  </DialogTitle>
                </DialogHeader>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {versions.length} {versions.length === 1 ? 'version' : 'versions'} saved
                </p>
              </div>
            </div>

            {selectedVersion && (
              <div className="flex items-center gap-2">
                {/* View mode toggle */}
                {currentSnapshot && (
                  <div className="flex items-center border rounded-lg p-0.5 bg-muted/50">
                    <button
                      onClick={() => setViewMode('preview')}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                        'outline-none focus-visible:ring-2 focus-visible:ring-primary',
                        viewMode === 'preview'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <IconEye aria-hidden="true" className="h-3.5 w-3.5" />
                      Preview
                    </button>
                    <button
                      onClick={() => setViewMode('diff')}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                        'outline-none focus-visible:ring-2 focus-visible:ring-primary',
                        viewMode === 'diff'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <IconGitCompare aria-hidden="true" className="h-3.5 w-3.5" />
                      Compare
                    </button>
                  </div>
                )}
                <Button
                  variant="default"
                  size="sm"
                  disabled={restoring}
                  onClick={() => setConfirmVersion(selectedVersion.version_number)}
                  className="gap-1.5"
                >
                  {restoring ? (
                    <IconLoader2 aria-hidden="true" className="h-3.5 w-3.5 motion-safe:animate-spin" />
                  ) : (
                    <IconRestore aria-hidden="true" className="h-3.5 w-3.5" />
                  )}
                  Restore this version
                </Button>
              </div>
            )}
          </div>

          {/* Main layout: sidebar + content */}
          <div className="flex flex-1 min-h-0">
            {/* Timeline sidebar */}
            <div className="w-72 shrink-0 border-r flex flex-col bg-muted/20">
              <ScrollArea className="flex-1">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <IconLoader2 aria-hidden="true" className="h-5 w-5 motion-safe:animate-spin text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Loading history...</p>
                  </div>
                ) : versions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 px-6 text-center gap-3">
                    <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
                      <IconHistory aria-hidden="true" className="h-7 w-7 text-muted-foreground/40" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium">No versions yet</p>
                      <p className="text-xs text-muted-foreground">
                        Versions are created automatically when you save changes.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="py-3">
                    {dateGroups.map((group) => (
                      <div key={group.date} className="mb-1">
                        {/* Date header */}
                        <div className="px-4 py-2 sticky top-0 bg-muted/20 backdrop-blur-sm z-10">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
                            {group.date}
                          </span>
                        </div>

                        {/* Timeline items */}
                        <div className="px-3 space-y-0.5">
                          {group.versions.map((v, idx) => {
                            const isSelected = selectedVersion?.id === v.id
                            const isLatest = versions[0]?.id === v.id
                            return (
                              <button
                                key={v.id}
                                onClick={() => setSelectedVersion(v)}
                                className={cn(
                                  'w-full text-left px-3 py-3 rounded-lg transition-all outline-none',
                                  'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
                                  isSelected
                                    ? 'bg-primary text-primary-foreground shadow-sm'
                                    : 'hover:bg-muted/80'
                                )}
                              >
                                <div className="flex items-start gap-3">
                                  {/* Timeline dot */}
                                  <div className={cn(
                                    'mt-1 w-2.5 h-2.5 rounded-full shrink-0 ring-2',
                                    isSelected
                                      ? 'bg-primary-foreground ring-primary-foreground/30'
                                      : isLatest
                                        ? 'bg-amber-500 ring-amber-500/20'
                                        : 'bg-muted-foreground/30 ring-muted/50'
                                  )} />

                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className={cn(
                                        'font-mono text-xs font-bold',
                                        isSelected ? 'text-primary-foreground' : 'text-foreground'
                                      )}>
                                        v{v.version_number}
                                      </span>
                                      {isLatest && (
                                        <span className={cn(
                                          'text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded',
                                          isSelected
                                            ? 'bg-primary-foreground/20 text-primary-foreground'
                                            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                        )}>
                                          Latest
                                        </span>
                                      )}
                                    </div>
                                    <div className={cn(
                                      'flex items-center gap-1.5 mt-1 text-[11px]',
                                      isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground'
                                    )}>
                                      <IconClock aria-hidden="true" className="h-3 w-3" />
                                      <span className="tabular-nums">{formatTime(v.created_at)}</span>
                                      <span className="opacity-50">·</span>
                                      <span>{timeAgo(v.created_at)}</span>
                                    </div>
                                  </div>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* Main content area */}
            <div className="flex-1 flex flex-col min-w-0 bg-background">
              {selectedVersion ? (
                <>
                  {/* Version info bar */}
                  <div className="px-6 py-3 border-b flex items-center gap-4 bg-muted/5 shrink-0">
                    <Badge variant="outline" className="font-mono text-xs h-6 px-2.5">
                      v{selectedVersion.version_number}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(selectedVersion.created_at)}
                    </span>
                    {viewMode === 'diff' && (
                      <span className="text-xs text-muted-foreground ml-auto">
                        Comparing with current state
                      </span>
                    )}
                  </div>

                  {/* Content */}
                  <ScrollArea className="flex-1">
                    <div className="p-6 max-w-4xl">
                      {viewMode === 'preview' ? (
                        <VersionPreview
                          contentType={contentType}
                          snapshot={selectedVersion.snapshot}
                        />
                      ) : currentSnapshot ? (
                        <VersionDiffPanel
                          versionNumber={selectedVersion.version_number}
                          versionDate={formatDate(selectedVersion.created_at)}
                          oldSnapshot={selectedVersion.snapshot as Record<string, unknown>}
                          newSnapshot={currentSnapshot as Record<string, unknown>}
                          contentType={contentType}
                          onBack={() => setViewMode('preview')}
                          embedded
                        />
                      ) : null}
                    </div>
                  </ScrollArea>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 p-8">
                  <div className="w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center">
                    <IconHistory aria-hidden="true" className="h-10 w-10 text-muted-foreground/30" />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-base font-medium">Select a version</p>
                    <p className="text-sm text-muted-foreground max-w-xs">
                      Choose a version from the timeline to preview its content or compare changes.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmVersion !== null} onOpenChange={(open) => !open && setConfirmVersion(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore version {confirmVersion}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will revert the content to version {confirmVersion}. Your current state will be saved
              as a new version, so you can always undo this restore.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmVersion && handleRestore(confirmVersion)}>
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
