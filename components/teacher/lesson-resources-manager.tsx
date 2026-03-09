'use client'

import { useState, useCallback, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  IconUpload,
  IconTrash,
  IconFile,
  IconFileTypePdf,
  IconFileSpreadsheet,
  IconFileText,
  IconPhoto,
  IconLoader2,
  IconGripVertical,
  IconPaperclip,
} from '@tabler/icons-react'
import {
  uploadLessonResource,
  deleteLessonResource,
  reorderLessonResources,
} from '@/app/actions/teacher/lesson-resources'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'

interface Resource {
  id: number
  file_name: string
  file_size: number
  mime_type: string
}

interface LessonResourcesManagerProps {
  lessonId: number
  initialResources: Resource[]
}

function getFileIcon(mimeType: string) {
  if (mimeType === 'application/pdf') return <IconFileTypePdf className="h-5 w-5 text-red-500" />
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType === 'text/csv')
    return <IconFileSpreadsheet className="h-5 w-5 text-emerald-500" />
  if (mimeType.includes('word') || mimeType.includes('document'))
    return <IconFileText className="h-5 w-5 text-blue-500" />
  if (mimeType.startsWith('image/')) return <IconPhoto className="h-5 w-5 text-violet-500" />
  return <IconFile className="h-5 w-5 text-muted-foreground" />
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function SortableResourceItem({
  resource,
  onDelete,
  deleting,
}: {
  resource: Resource
  onDelete: (id: number) => void
  deleting: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: resource.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 transition-shadow',
        isDragging && 'shadow-lg ring-2 ring-primary/20'
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground/50 hover:text-muted-foreground"
        {...attributes}
        {...listeners}
      >
        <IconGripVertical className="h-4 w-4" />
      </button>

      {getFileIcon(resource.mime_type)}

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{resource.file_name}</p>
        <p className="text-xs text-muted-foreground">{formatFileSize(resource.file_size)}</p>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
        onClick={() => onDelete(resource.id)}
        disabled={deleting}
      >
        {deleting ? (
          <IconLoader2 className="h-4 w-4 motion-safe:animate-spin" />
        ) : (
          <IconTrash className="h-4 w-4" />
        )}
      </Button>
    </div>
  )
}

export function LessonResourcesManager({
  lessonId,
  initialResources,
}: LessonResourcesManagerProps) {
  const t = useTranslations('dashboard.teacher.lessonEditor')
  const [resources, setResources] = useState<Resource[]>(initialResources)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const handleUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return
      setUploading(true)
      setError(null)

      for (const file of Array.from(files)) {
        const formData = new FormData()
        formData.append('file', file)

        const result = await uploadLessonResource(lessonId, formData)

        if (result.success && result.data) {
          setResources((prev) => [...prev, result.data!])
        } else if (!result.success) {
          setError(result.error)
          break
        }
      }

      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    [lessonId]
  )

  const handleDelete = useCallback(
    async (resourceId: number) => {
      setDeletingId(resourceId)
      const result = await deleteLessonResource(resourceId)
      if (result.success) {
        setResources((prev) => prev.filter((r) => r.id !== resourceId))
      } else if (!result.success) {
        setError(result.error)
      }
      setDeletingId(null)
    },
    []
  )

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const oldIndex = resources.findIndex((r) => r.id === active.id)
      const newIndex = resources.findIndex((r) => r.id === over.id)
      const newOrder = arrayMove(resources, oldIndex, newIndex)

      setResources(newOrder)
      await reorderLessonResources(
        lessonId,
        newOrder.map((r) => r.id)
      )
    },
    [resources, lessonId]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      handleUpload(e.dataTransfer.files)
    },
    [handleUpload]
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <IconPaperclip className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">{t('resources')}</h3>
      </div>
      <p className="text-xs text-muted-foreground">{t('resourcesDescription')}</p>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          'relative rounded-xl border-2 border-dashed p-6 text-center transition-colors',
          isDragOver
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/20 hover:border-muted-foreground/40'
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.gif,.webp"
          className="absolute inset-0 cursor-pointer opacity-0"
          onChange={(e) => handleUpload(e.target.files)}
          disabled={uploading}
        />
        <div className="flex flex-col items-center gap-2">
          {uploading ? (
            <IconLoader2 className="h-8 w-8 text-primary motion-safe:animate-spin" />
          ) : (
            <IconUpload className="h-8 w-8 text-muted-foreground/50" />
          )}
          <div>
            <p className="text-sm font-medium">
              {uploading ? t('uploading') : t('uploadFiles')}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('dropFilesHere')} · {t('maxFileSize')}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* Resource list */}
      {resources.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={resources.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1.5">
              {resources.map((resource) => (
                <SortableResourceItem
                  key={resource.id}
                  resource={resource}
                  onDelete={handleDelete}
                  deleting={deletingId === resource.id}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        !uploading && (
          <p className="text-center text-xs text-muted-foreground py-4">{t('noResources')}</p>
        )
      )}
    </div>
  )
}
