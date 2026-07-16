'use client'

import { useTranslations } from 'next-intl'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { IconCheck, IconArchive, IconRestore, IconDotsVertical } from '@tabler/icons-react'
import { ConfirmDialog } from './confirm-dialog'
import { approveCourse, archiveCourse, restoreCourse } from '@/app/actions/admin/courses'

interface CourseStatusActionsProps {
  courseId: number
  currentStatus: 'draft' | 'published' | 'archived'
  courseTitle: string
}

export function CourseStatusActions({
  courseId,
  currentStatus,
  courseTitle
}: CourseStatusActionsProps) {
  const t = useTranslations('dashboard.admin.courses.statusActions')
  const [loading, setLoading] = useState(false)
  const [showApproveDialog, setShowApproveDialog] = useState(false)
  const [showArchiveDialog, setShowArchiveDialog] = useState(false)
  const [showRestoreDialog, setShowRestoreDialog] = useState(false)
  const router = useRouter()

  const handleApprove = async () => {
    setLoading(true)
    const result = await approveCourse(courseId)

    if (result.success) {
      toast.success(t('toasts.approveSuccess', { title: courseTitle }))
      setShowApproveDialog(false)
      router.refresh()
    } else {
      toast.error(result.error || t('toasts.approveError'))
    }

    setLoading(false)
  }

  const handleArchive = async () => {
    setLoading(true)
    const result = await archiveCourse(courseId)

    if (result.success) {
      toast.success(t('toasts.archiveSuccess', { title: courseTitle }))
      setShowArchiveDialog(false)
      router.refresh()
    } else {
      toast.error(result.error || t('toasts.archiveError'))
    }

    setLoading(false)
  }

  const handleRestore = async () => {
    setLoading(true)
    const result = await restoreCourse(courseId)

    if (result.success) {
      toast.success(t('toasts.restoreSuccess', { title: courseTitle }))
      setShowRestoreDialog(false)
      router.refresh()
    } else {
      toast.error(result.error || t('toasts.restoreError'))
    }

    setLoading(false)
  }

  return (
    <>
      {/* The dropdown and its dialogs must stay siblings of DropdownMenuContent
          (not nested inside it) — the menu popup unmounts on close, which would
          wipe the showXDialog state right as a click opens it. */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" className="size-8">
              <IconDotsVertical className="h-4 w-4" />
              <span className="sr-only">{t('moreActions')}</span>
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          {currentStatus === 'draft' && (
            <DropdownMenuItem
              disabled={loading}
              onClick={() => setShowApproveDialog(true)}
            >
              <IconCheck className="text-emerald-600 dark:text-emerald-400" />
              {t('approve')}
            </DropdownMenuItem>
          )}

          {currentStatus === 'published' && (
            <DropdownMenuItem
              variant="destructive"
              disabled={loading}
              onClick={() => setShowArchiveDialog(true)}
            >
              <IconArchive />
              {t('archive')}
            </DropdownMenuItem>
          )}

          {currentStatus === 'archived' && (
            <DropdownMenuItem
              disabled={loading}
              onClick={() => setShowRestoreDialog(true)}
            >
              <IconRestore />
              {t('restore')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Approve Confirmation */}
      <ConfirmDialog
        open={showApproveDialog}
        onOpenChange={setShowApproveDialog}
        title={t('dialogs.approve.title')}
        description={t('dialogs.approve.description', { title: courseTitle })}
        confirmText={t('dialogs.approve.confirm')}
        cancelText={t('cancel')}
        onConfirm={handleApprove}
      />

      {/* Archive Confirmation */}
      <ConfirmDialog
        open={showArchiveDialog}
        onOpenChange={setShowArchiveDialog}
        title={t('dialogs.archive.title')}
        description={t('dialogs.archive.description', { title: courseTitle })}
        confirmText={t('dialogs.archive.confirm')}
        cancelText={t('cancel')}
        variant="destructive"
        onConfirm={handleArchive}
      />

      {/* Restore Confirmation */}
      <ConfirmDialog
        open={showRestoreDialog}
        onOpenChange={setShowRestoreDialog}
        title={t('dialogs.restore.title')}
        description={t('dialogs.restore.description', { title: courseTitle })}
        confirmText={t('dialogs.restore.confirm')}
        cancelText={t('cancel')}
        onConfirm={handleRestore}
      />
    </>
  )
}
