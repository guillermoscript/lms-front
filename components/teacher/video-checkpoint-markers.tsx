'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
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
import { IconClock, IconLoader2, IconPlus, IconTrash } from '@tabler/icons-react'
import {
  listLessonCheckpoints,
  listCheckpointExercises,
  createLessonCheckpoint,
  updateLessonCheckpoint,
  deleteLessonCheckpoint,
  type TeacherLessonCheckpoint,
  type CheckpointExerciseOption,
} from '@/app/actions/teacher/lesson-checkpoints'

interface VideoCheckpointMarkersProps {
  courseId: number
  lessonId: number
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function parseTimestamp(input: string): number | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const parts = trimmed.split(':')
  if (parts.length === 1) {
    const n = Number(parts[0])
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null
  }
  if (parts.length === 2) {
    const m = Number(parts[0])
    const s = Number(parts[1])
    if (!Number.isFinite(m) || !Number.isFinite(s) || m < 0 || s < 0 || s >= 60) return null
    return Math.floor(m * 60 + s)
  }
  return null
}

export function VideoCheckpointMarkers({ courseId, lessonId }: VideoCheckpointMarkersProps) {
  const t = useTranslations('dashboard.teacher.lessonEditor.videoCheckpoints')

  const [loading, setLoading] = useState(true)
  const [checkpoints, setCheckpoints] = useState<TeacherLessonCheckpoint[]>([])
  const [exercises, setExercises] = useState<CheckpointExerciseOption[]>([])
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [newTimestamp, setNewTimestamp] = useState('')
  const [newExerciseId, setNewExerciseId] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [newRequired, setNewRequired] = useState(true)
  const [newAllowSkip, setNewAllowSkip] = useState(false)

  const refresh = async () => {
    const result = await listLessonCheckpoints(lessonId)
    if (result.success) {
      setCheckpoints(
        result.data.checkpoints
          .filter((c) => c.placement_type === 'video')
          .sort((a, b) => (a.video_timestamp_seconds ?? 0) - (b.video_timestamp_seconds ?? 0))
      )
    }
  }

  useEffect(() => {
    let cancelled = false
    Promise.all([listLessonCheckpoints(lessonId), listCheckpointExercises(courseId)])
      .then(([checkpointsResult, exercisesResult]) => {
        if (cancelled) return
        if (checkpointsResult.success) {
          setCheckpoints(
            checkpointsResult.data.checkpoints
              .filter((c) => c.placement_type === 'video')
              .sort((a, b) => (a.video_timestamp_seconds ?? 0) - (b.video_timestamp_seconds ?? 0))
          )
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

  const handleCreate = async () => {
    const seconds = parseTimestamp(newTimestamp)
    if (seconds === null || !newExerciseId) {
      setError(t('invalidTimestamp'))
      return
    }
    setSaving(true)
    setError(null)
    const result = await createLessonCheckpoint({
      lessonId,
      exerciseId: parseInt(newExerciseId, 10),
      placementType: 'video',
      videoTimestampSeconds: seconds,
      label: newLabel || null,
      isRequired: newRequired,
      allowSkip: newAllowSkip,
    })
    setSaving(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    setShowCreateForm(false)
    setNewTimestamp('')
    setNewExerciseId('')
    setNewLabel('')
    setNewRequired(true)
    setNewAllowSkip(false)
    await refresh()
  }

  const handleUpdateTimestamp = async (checkpoint: TeacherLessonCheckpoint, value: string) => {
    const seconds = parseTimestamp(value)
    if (seconds === null) return
    setSaving(true)
    await updateLessonCheckpoint(checkpoint.id, { videoTimestampSeconds: seconds })
    setSaving(false)
    await refresh()
  }

  const handleToggleRequired = async (checkpoint: TeacherLessonCheckpoint, value: boolean) => {
    setSaving(true)
    await updateLessonCheckpoint(checkpoint.id, { isRequired: value })
    setSaving(false)
    await refresh()
  }

  const handleToggleAllowSkip = async (checkpoint: TeacherLessonCheckpoint, value: boolean) => {
    setSaving(true)
    await updateLessonCheckpoint(checkpoint.id, { allowSkip: value })
    setSaving(false)
    await refresh()
  }

  const handleDelete = async (checkpoint: TeacherLessonCheckpoint) => {
    setSaving(true)
    await deleteLessonCheckpoint(checkpoint.id)
    setSaving(false)
    await refresh()
  }

  return (
    <div className="mt-4 rounded-lg border bg-muted/20 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <IconClock className="h-4 w-4 text-muted-foreground" />
        {t('title')}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
          {t('loading')}
        </div>
      )}

      {!loading && checkpoints.length === 0 && !showCreateForm && (
        <p className="mb-3 text-xs text-muted-foreground">{t('empty')}</p>
      )}

      {!loading && checkpoints.length > 0 && (
        <div className="mb-3 space-y-2">
          {checkpoints.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-md border bg-background/60 p-2">
              <Input
                defaultValue={formatTimestamp(c.video_timestamp_seconds ?? 0)}
                onBlur={(e) => handleUpdateTimestamp(c, e.target.value)}
                placeholder="mm:ss"
                className="h-7 w-16 text-xs"
                disabled={saving}
              />
              <span className="flex-1 truncate text-xs text-muted-foreground">
                {c.exercise?.title || t('unknownExercise')}
                {c.label ? ` — ${c.label}` : ''}
              </span>
              <div className="flex items-center gap-1">
                <Label className="text-[10px] text-muted-foreground">{t('requiredShort')}</Label>
                <Switch
                  size="sm"
                  checked={c.is_required}
                  onCheckedChange={(value) => handleToggleRequired(c, value)}
                  disabled={saving}
                />
              </div>
              <div className="flex items-center gap-1">
                <Label className="text-[10px] text-muted-foreground">{t('allowSkipShort')}</Label>
                <Switch
                  size="sm"
                  checked={c.allow_skip}
                  onCheckedChange={(value) => handleToggleAllowSkip(c, value)}
                  disabled={saving}
                />
              </div>
              <button
                type="button"
                onClick={() => handleDelete(c)}
                className="p-1 text-muted-foreground hover:text-destructive"
                aria-label={t('remove')}
                disabled={saving}
              >
                <IconTrash className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {!loading && showCreateForm && (
        <div className="mb-3 space-y-3 rounded-md border bg-background/60 p-3">
          <div className="flex gap-2">
            <div className="w-20">
              <Label className="mb-1 text-xs text-muted-foreground">{t('timestampLabel')}</Label>
              <Input
                value={newTimestamp}
                onChange={(e) => setNewTimestamp(e.target.value)}
                placeholder="mm:ss"
                className="h-8 text-xs"
              />
            </div>
            <div className="flex-1">
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

          <div className="flex gap-2">
            <Button type="button" size="sm" className="flex-1" onClick={handleCreate} disabled={saving}>
              {saving && <IconLoader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              {t('save')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowCreateForm(false)
                setError(null)
              }}
            >
              {t('cancel')}
            </Button>
          </div>
        </div>
      )}

      {!loading && !showCreateForm && (
        <Button type="button" variant="outline" size="sm" onClick={() => setShowCreateForm(true)}>
          <IconPlus className="mr-2 h-3.5 w-3.5" />
          {t('addMarker')}
        </Button>
      )}
    </div>
  )
}
