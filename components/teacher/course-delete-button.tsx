'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
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
  const t = useTranslations('dashboard.teacher.courseDelete')
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
        toast.success(t('archiveSuccess'))
        setOpen(false)
        router.push('/dashboard/teacher/courses')
      } catch (err: any) {
        toast.error(err.message || t('archiveError'))
      }
    })
  }

  const handleDelete = () => {
    startTransition(async () => {
      try {
        await deleteCourse(courseId)
        toast.success(t('deleteSuccess'))
        setOpen(false)
        router.push('/dashboard/teacher/courses')
      } catch (err: any) {
        toast.error(err.message || t('deleteError'))
      }
    })
  }

  const hasEnrollments = enrollmentCount !== null && enrollmentCount > 0

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
        <IconTrash className="mr-2 h-4 w-4" />
        {t('triggerButton')}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {hasEnrollments
              ? t('titleWithEnrollments', { count: enrollmentCount })
              : t('titleNoEnrollments')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {hasEnrollments ? (
              <>
                <strong>{enrollmentCount}</strong> {enrollmentCount === 1 ? t('studentSingular') : t('studentPlural')}{' '}
                {t('enrolledInCourse', { title: courseTitle })}
                <br /><br />
                {t('archiveSuggestion')}
              </>
            ) : (
              <>
                {t('confirmDelete', { title: courseTitle })}
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{t('cancel')}</AlertDialogCancel>
          {hasEnrollments && (
            <Button
              variant="outline"
              onClick={handleArchive}
              disabled={isPending}
            >
              {isPending ? (
                <IconLoader className="mr-2 h-4 w-4 motion-safe:animate-spin" />
              ) : (
                <IconArchive className="mr-2 h-4 w-4" />
              )}
              {t('archiveInstead')}
            </Button>
          )}
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? (
              <IconLoader className="mr-2 h-4 w-4 motion-safe:animate-spin" />
            ) : (
              <IconTrash className="mr-2 h-4 w-4" />
            )}
            {hasEnrollments ? t('deleteAnyway') : t('delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
