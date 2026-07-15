'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { CheckpointBlock } from '../types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { IconChecklist, IconLoader2, IconPlus, IconPencil, IconX } from '@tabler/icons-react'
import {
  listLessonCheckpoints,
  listCheckpointExercises,
  createLessonCheckpoint,
  updateLessonCheckpoint,
  type TeacherLessonCheckpoint,
  type CheckpointExerciseOption,
} from '@/app/actions/teacher/lesson-checkpoints'

export interface CheckpointContext {
  courseId: number
  lessonId: number | null
}

interface CheckpointBlockEditorProps {
  block: CheckpointBlock
  onChange: (updates: Partial<CheckpointBlock>) => void
  checkpointContext?: CheckpointContext
}

export function CheckpointBlockEditor({ block, onChange, checkpointContext }: CheckpointBlockEditorProps) {
  const t = useTranslations('dashboard.teacher.lessonEditor.checkpointBlock')
  const lessonId = checkpointContext?.lessonId ?? null
  const courseId = checkpointContext?.courseId

  const [loading, setLoading] = useState(true)
  const [checkpoints, setCheckpoints] = useState<TeacherLessonCheckpoint[]>([])
  const [exercises, setExercises] = useState<CheckpointExerciseOption[]>([])
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // New-checkpoint form state
  const [newExerciseId, setNewExerciseId] = useState<string>('')
  const [newLabel, setNewLabel] = useState('')
  const [newRequired, setNewRequired] = useState(true)
  const [newAllowSkip, setNewAllowSkip] = useState(false)

  useEffect(() => {
    if (!lessonId || !courseId) return
    let cancelled = false
    Promise.all([listLessonCheckpoints(lessonId), listCheckpointExercises(courseId)])
      .then(([checkpointsResult, exercisesResult]) => {
        if (cancelled) return
        if (checkpointsResult.success) {
          setCheckpoints(checkpointsResult.data.checkpoints.filter((c) => c.placement_type === 'inline'))
        }
        if (exercisesResult.success) {
          setExercises(exercisesResult.data.exercises)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [lessonId, courseId])

  const selected = checkpoints.find((c) => c.id === block.checkpointId) || null

  const handleSelectExisting = (value: string | null) => {
    const id = value ? parseInt(value, 10) : NaN
    onChange({ checkpointId: Number.isNaN(id) ? null : id })
  }

  const handleCreate = async () => {
    if (!lessonId || !newExerciseId) return
    setSaving(true)
    setError(null)
    const result = await createLessonCheckpoint({
      lessonId,
      exerciseId: parseInt(newExerciseId, 10),
      placementType: 'inline',
      contentBlockId: block.id,
      label: newLabel || null,
      isRequired: newRequired,
      allowSkip: newAllowSkip,
    })
    setSaving(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    onChange({ checkpointId: result.data.checkpointId })
    setShowCreateForm(false)
    if (lessonId) {
      const refreshed = await listLessonCheckpoints(lessonId)
      if (refreshed.success) {
        setCheckpoints(refreshed.data.checkpoints.filter((c) => c.placement_type === 'inline'))
      }
    }
  }

  const handleToggleRequired = async (value: boolean) => {
    if (!selected) return
    setSaving(true)
    const result = await updateLessonCheckpoint(selected.id, { isRequired: value })
    setSaving(false)
    if (result.success && lessonId) {
      const refreshed = await listLessonCheckpoints(lessonId)
      if (refreshed.success) {
        setCheckpoints(refreshed.data.checkpoints.filter((c) => c.placement_type === 'inline'))
      }
    }
  }

  const handleToggleAllowSkip = async (value: boolean) => {
    if (!selected) return
    setSaving(true)
    const result = await updateLessonCheckpoint(selected.id, { allowSkip: value })
    setSaving(false)
    if (result.success && lessonId) {
      const refreshed = await listLessonCheckpoints(lessonId)
      if (refreshed.success) {
        setCheckpoints(refreshed.data.checkpoints.filter((c) => c.placement_type === 'inline'))
      }
    }
  }

  if (!lessonId) {
    return (
      <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 p-4 text-center">
        <IconChecklist className="mx-auto mb-2 h-5 w-5 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">{t('saveLessonFirst')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-lg border bg-gradient-to-br from-teal-500/5 to-cyan-500/5 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-teal-600">
        <IconChecklist className="h-4 w-4" />
        {t('title')}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
          {t('loading')}
        </div>
      )}

      {!loading && selected && (
        <div className="space-y-3 rounded-md border bg-background/60 p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium">{selected.exercise?.title || t('unknownExercise')}</p>
              {selected.label && <p className="text-xs text-muted-foreground">{selected.label}</p>}
              {selected.exercise?.exercise_type && (
                <p className="mt-0.5 text-[11px] text-muted-foreground/70">{selected.exercise.exercise_type}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onChange({ checkpointId: null })}
              className="p-1 text-muted-foreground hover:text-destructive"
              aria-label={t('changeCheckpoint')}
            >
              <IconX className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor={`cp-required-${block.id}`} className="text-xs text-muted-foreground">
              {t('requiredLabel')}
            </Label>
            <Switch
              id={`cp-required-${block.id}`}
              checked={selected.is_required}
              onCheckedChange={handleToggleRequired}
              disabled={saving}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor={`cp-skip-${block.id}`} className="text-xs text-muted-foreground">
              {t('allowSkipLabel')}
            </Label>
            <Switch
              id={`cp-skip-${block.id}`}
              checked={selected.allow_skip}
              onCheckedChange={handleToggleAllowSkip}
              disabled={saving}
            />
          </div>
        </div>
      )}

      {!loading && !selected && !showCreateForm && (
        <div className="space-y-2">
          {checkpoints.length > 0 && (
            <Select value="" onValueChange={handleSelectExisting}>
              <SelectTrigger className="w-full h-8 text-xs">
                <SelectValue placeholder={t('selectExisting')} />
              </SelectTrigger>
              <SelectContent>
                {checkpoints.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.exercise?.title || t('unknownExercise')}
                    {c.label ? ` — ${c.label}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setShowCreateForm(true)}
          >
            <IconPlus className="mr-2 h-3.5 w-3.5" />
            {t('createNew')}
          </Button>
        </div>
      )}

      {!loading && !selected && showCreateForm && (
        <div className="space-y-3 rounded-md border bg-background/60 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">{t('createNew')}</span>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="p-1 text-muted-foreground hover:text-foreground"
              aria-label={t('cancel')}
            >
              <IconX className="h-3.5 w-3.5" />
            </button>
          </div>

          <div>
            <Label className="mb-1 text-xs text-muted-foreground">{t('exerciseLabel')}</Label>
            <Select value={newExerciseId} onValueChange={(value) => setNewExerciseId(value || '')}>
              <SelectTrigger className="w-full h-8 text-xs">
                <SelectValue placeholder={t('exercisePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {exercises.map((ex) => (
                  <SelectItem key={ex.id} value={String(ex.id)}>
                    {ex.title} ({ex.exercise_type}
                    {ex.status === 'draft' || ex.status === 'archived'
                      ? ` · ${t(`exerciseStatus.${ex.status}`)}`
                      : ''})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-1 text-xs text-muted-foreground">{t('labelOptional')}</Label>
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder={t('labelPlaceholder')}
              className="h-8 text-xs"
            />
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">{t('requiredLabel')}</Label>
            <Switch checked={newRequired} onCheckedChange={setNewRequired} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">{t('allowSkipLabel')}</Label>
            <Switch checked={newAllowSkip} onCheckedChange={setNewAllowSkip} />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <Button
            type="button"
            size="sm"
            className="w-full"
            onClick={handleCreate}
            disabled={!newExerciseId || saving}
          >
            {saving ? (
              <IconLoader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <IconPencil className="mr-2 h-3.5 w-3.5" />
            )}
            {t('save')}
          </Button>
        </div>
      )}
    </div>
  )
}

export const CHECKPOINT_BLOCK_ICON = IconChecklist
