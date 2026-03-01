'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { IconTrash, IconArchive, IconLoader } from '@tabler/icons-react'
import { toast } from 'sonner'
import { getCourseEnrollmentCount, archiveCourse, deleteCourse } from '@/app/actions/teacher/courses'

interface CourseDeleteButtonProps {
  courseId: number
  courseTitle: string
}

export function CourseDeleteButton({ courseId, courseTitle }: CourseDeleteButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [enrollmentCount, setEnrollmentCount] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen && enrollmentCount === null) {
      // Fetch enrollment count when dialog opens
      getCourseEnrollmentCount(courseId).then(({ enrollmentCount: count }) => {
        setEnrollmentCount(count)
      })
    }
    setOpen(newOpen)
  }

  const handleArchive = () => {
    startTransition(async () => {
      try {
        await archiveCourse(courseId)
        toast.success('Course archived successfully')
        setOpen(false)
        router.push('/dashboard/teacher/courses')
      } catch (err: any) {
        toast.error(err.message || 'Failed to archive course')
      }
    })
  }

  const handleDelete = () => {
    startTransition(async () => {
      try {
        await deleteCourse(courseId)
        toast.success('Course deleted')
        setOpen(false)
        router.push('/dashboard/teacher/courses')
      } catch (err: any) {
        toast.error(err.message || 'Failed to delete course')
      }
    })
  }

  const hasEnrollments = enrollmentCount !== null && enrollmentCount > 0

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
        <IconTrash className="mr-2 h-4 w-4" />
        Delete Course
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {hasEnrollments
              ? `${enrollmentCount} student${enrollmentCount === 1 ? '' : 's'} enrolled`
              : 'Delete course?'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {hasEnrollments ? (
              <>
                <strong>{enrollmentCount}</strong> student{enrollmentCount === 1 ? ' is' : 's are'} currently enrolled in{' '}
                <strong>&quot;{courseTitle}&quot;</strong>. Deleting will immediately remove their access.
                <br /><br />
                Consider <strong>archiving</strong> instead — enrolled students will keep access, but the course won&apos;t appear to new students.
              </>
            ) : (
              <>
                Are you sure you want to delete <strong>&quot;{courseTitle}&quot;</strong>? This action cannot be undone.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          {hasEnrollments && (
            <Button
              variant="outline"
              onClick={handleArchive}
              disabled={isPending}
            >
              {isPending ? (
                <IconLoader className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <IconArchive className="mr-2 h-4 w-4" />
              )}
              Archive Instead
            </Button>
          )}
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? (
              <IconLoader className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <IconTrash className="mr-2 h-4 w-4" />
            )}
            {hasEnrollments ? 'Delete Anyway' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
