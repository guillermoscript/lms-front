'use client'

import { useTranslations } from 'next-intl'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { IconCheck, IconArchive, IconRestore } from '@tabler/icons-react'
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
      <div className="flex gap-2">
        {currentStatus === 'draft' && (
          <Button
            size="sm"
            onClick={() => setShowApproveDialog(true)}
            disabled={loading}
          >
            <IconCheck className="mr-2 h-4 w-4" />
            {t('approve')}
          </Button>
        )}

        {currentStatus === 'published' && (
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setShowArchiveDialog(true)}
            disabled={loading}
          >
            <IconArchive className="mr-2 h-4 w-4" />
            {t('archive')}
          </Button>
        )}

        {currentStatus === 'archived' && (
          <Button
            size="sm"
            variant="default"
            onClick={() => setShowRestoreDialog(true)}
            disabled={loading}
          >
            <IconRestore className="mr-2 h-4 w-4" />
            {t('restore')}
          </Button>
        )}
      </div>

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
