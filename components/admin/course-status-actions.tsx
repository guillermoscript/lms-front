'use client'

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
  const [loading, setLoading] = useState(false)
  const [showApproveDialog, setShowApproveDialog] = useState(false)
  const [showArchiveDialog, setShowArchiveDialog] = useState(false)
  const [showRestoreDialog, setShowRestoreDialog] = useState(false)
  const router = useRouter()

  const handleApprove = async () => {
    setLoading(true)
    const result = await approveCourse(courseId)

    if (result.success) {
      toast.success(`Course "${courseTitle}" approved and published`)
      setShowApproveDialog(false)
      router.refresh()
    } else {
      toast.error(result.error || 'Failed to approve course')
    }

    setLoading(false)
  }

  const handleArchive = async () => {
    setLoading(true)
    const result = await archiveCourse(courseId)

    if (result.success) {
      toast.success(`Course "${courseTitle}" archived`)
      setShowArchiveDialog(false)
      router.refresh()
    } else {
      toast.error(result.error || 'Failed to archive course')
    }

    setLoading(false)
  }

  const handleRestore = async () => {
    setLoading(true)
    const result = await restoreCourse(courseId)

    if (result.success) {
      toast.success(`Course "${courseTitle}" restored`)
      setShowRestoreDialog(false)
      router.refresh()
    } else {
      toast.error(result.error || 'Failed to restore course')
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
            Approve
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
            Archive
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
            Restore
          </Button>
        )}
      </div>

      {/* Approve Confirmation */}
      <ConfirmDialog
        open={showApproveDialog}
        onOpenChange={setShowApproveDialog}
        title="Approve Course"
        description={`Are you sure you want to approve and publish "${courseTitle}"? It will be visible to all students.`}
        confirmText="Approve & Publish"
        onConfirm={handleApprove}
      />

      {/* Archive Confirmation */}
      <ConfirmDialog
        open={showArchiveDialog}
        onOpenChange={setShowArchiveDialog}
        title="Archive Course"
        description={`Are you sure you want to archive "${courseTitle}"? It will no longer be visible to students.`}
        confirmText="Archive"
        variant="destructive"
        onConfirm={handleArchive}
      />

      {/* Restore Confirmation */}
      <ConfirmDialog
        open={showRestoreDialog}
        onOpenChange={setShowRestoreDialog}
        title="Restore Course"
        description={`Are you sure you want to restore "${courseTitle}"? It will be published and visible to students again.`}
        confirmText="Restore"
        onConfirm={handleRestore}
      />
    </>
  )
}
