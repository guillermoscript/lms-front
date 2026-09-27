'use client'

// Staff register: the teacher's lesson list (DESIGN.md, desk density).

import { createContext, useContext, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { IconMessagePlus } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { DiscussionPromptComposer } from './discussion-prompt-composer'

const OpenComposerContext = createContext<((lessonId: number) => void) | null>(null)

interface DiscussionPromptShortcutsProps {
  courseId: number
  /**
   * The course's lessons for the composer's picker, serialised once for the
   * whole list. `null` when the plan has no community: the list renders alone.
   */
  lessons: { id: number; title: string }[] | null
  children: React.ReactNode
}

/**
 * "Add discussion prompt" on each row of the teacher's lesson list (#869).
 *
 * One sheet for the whole list, rendered outside every row: each row is an
 * overlay link, and React events bubble through portals, so a sheet inside a
 * row would send its clicks into the lesson editor.
 */
export function DiscussionPromptShortcuts({ courseId, lessons, children }: DiscussionPromptShortcutsProps) {
  if (!lessons) return <>{children}</>
  return (
    <ShortcutSheet courseId={courseId} lessons={lessons}>
      {children}
    </ShortcutSheet>
  )
}

function ShortcutSheet({
  courseId,
  lessons,
  children,
}: {
  courseId: number
  lessons: { id: number; title: string }[]
  children: React.ReactNode
}) {
  const t = useTranslations('community.lessonDiscussion')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [lessonId, setLessonId] = useState<number | null>(null)

  function openFor(id: number) {
    setLessonId(id)
    setOpen(true)
  }

  // No router.refresh(): createPost revalidates this course's pages, and Next
  // re-renders the current route in the action's response — the row's count
  // is already fresh when the promise resolves.
  function handleCreated(postId: string) {
    setOpen(false)
    toast.success(t('promptPosted'), {
      action: {
        label: t('view'),
        onClick: () => router.push(`/dashboard/teacher/courses/${courseId}/community?post=${postId}`),
      },
    })
  }

  return (
    <OpenComposerContext.Provider value={openFor}>
      {children}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="data-[side=right]:w-full data-[side=right]:sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t('sheetTitle')}</SheetTitle>
            <SheetDescription>{t('sheetDescription')}</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
            {lessonId !== null && (
              <DiscussionPromptComposer
                key={lessonId}
                courseId={courseId}
                lessons={lessons}
                defaultLessonId={lessonId}
                heading={false}
                className="border-0 bg-transparent p-0"
                onCreated={handleCreated}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </OpenComposerContext.Provider>
  )
}

/** The row's shortcut. Renders nothing outside `DiscussionPromptShortcuts`. */
export function AddDiscussionPromptTrigger({ lessonId, lessonTitle }: { lessonId: number; lessonTitle: string }) {
  const t = useTranslations('community.lessonDiscussion')
  const openFor = useContext(OpenComposerContext)
  if (!openFor) return null

  return (
    <Button
      variant="ghost"
      size="sm"
      // Starts with the visible text, so voice control still finds it (WCAG 2.5.3).
      aria-label={t('addPromptFor', { lesson: lessonTitle })}
      onClick={(e) => {
        // The row is a link into the lesson editor; this is not a way in.
        e.preventDefault()
        e.stopPropagation()
        openFor(lessonId)
      }}
    >
      <IconMessagePlus aria-hidden="true" />
      <span className="hidden lg:inline">{t('addPrompt')}</span>
    </Button>
  )
}
