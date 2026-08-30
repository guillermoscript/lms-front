'use client'

/**
 * One student, item by item: which lessons they cleared and when, which
 * exercises they finished, how each exam went, and what is next (#647).
 *
 * Opens from the Students tab table. Everything shown comes from the report
 * the page already built — no extra fetch — so opening it is instant.
 */

import { useTranslations, useFormatter } from 'next-intl'
import { IconCheck, IconCircle, IconArrowRight, IconAlertCircle } from '@tabler/icons-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { EXAM_PASS_SCORE, STALL_DAYS, type CourseItem, type StudentProgress } from '@/lib/analytics/student-progress'
import { EngagementBadge, ProgressCell, ActivityTime, Fact } from './student-progress-cells'
import { IssueCertificateButton } from './issue-certificate-button'

export interface SheetStudent {
  userId: string
  progress: StudentProgress
  displayName: string
  avatarUrl: string | null
  enrolledAt: string | null
}

interface StudentProgressSheetProps {
  student: SheetStudent | null
  onClose: () => void
  lessons: CourseItem[]
  exercises: CourseItem[]
  exams: CourseItem[]
  generatedAt: string
  courseId: number
  existingCertificateId?: string
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function SectionTitle({ children, count }: { children: string; count: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b pb-1.5">
      <h3 className="text-sm font-semibold">{children}</h3>
      <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
    </div>
  )
}

export function StudentProgressSheet({
  student,
  onClose,
  lessons,
  exercises,
  exams,
  generatedAt,
  courseId,
  existingCertificateId,
}: StudentProgressSheetProps) {
  const t = useTranslations('dashboard.teacher.manageCourse.studentList')
  const format = useFormatter()

  const p = student?.progress
  const completedAt = new Map(p?.completedLessons.map((c) => [c.lessonId, c.completedAt]) ?? [])
  const exerciseDone = new Set(p?.completedExerciseIds ?? [])
  const examById = new Map(p?.exams.map((e) => [e.examId, e]) ?? [])
  const nextLesson = p?.nextLessonId != null ? lessons.find((l) => l.id === p.nextLessonId) : null
  const nextExam = p && !nextLesson ? exams.find((e) => !examById.get(e.id)?.passed) : null

  const fmtDate = (iso: string | null) =>
    iso ? format.dateTime(new Date(iso), { dateStyle: 'medium' }) : null

  return (
    <Sheet open={student !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        {student && p && (
          <>
            <SheetHeader className="gap-3 border-b pb-4">
              <div className="flex items-center gap-3 pr-8">
                <Avatar size="sm">
                  {student.avatarUrl && <AvatarImage src={student.avatarUrl} alt={student.displayName} />}
                  <AvatarFallback>{getInitials(student.displayName)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <SheetTitle className="truncate text-base">{student.displayName}</SheetTitle>
                  <SheetDescription className="text-xs">
                    {student.enrolledAt
                      ? t('sheet.enrolled', { date: fmtDate(student.enrolledAt) ?? '' })
                      : t('title')}
                  </SheetDescription>
                </div>
              </div>

              <ProgressCell
                value={p.overallPercentage}
                total={p.totalLessons}
                label={t('table.progress')}
                emptyLabel={t('noLessons')}
              />

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Fact label={t('table.status')}>
                  <EngagementBadge
                    status={p.status}
                    label={t(`status.${p.status}`)}
                    title={t(`statusHint.${p.status}`, { days: STALL_DAYS })}
                  />
                </Fact>
                <Fact label={t('table.lastActivity')}>
                  <ActivityTime value={p.lastActivityAt} now={generatedAt} emptyLabel={t('noActivity')} />
                </Fact>
              </dl>

              {/* The full-label certificate action lives here; the table row only has room for the icon. */}
              <div className="flex items-center justify-end">
                <IssueCertificateButton
                  courseId={courseId}
                  userId={student.userId}
                  studentName={student.displayName}
                  existingCertificateId={existingCertificateId}
                />
              </div>

              {/* What's next — the one line a teacher would put in a nudge email. */}
              <div
                className={cn(
                  'flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
                  p.status === 'completed' ? 'border-primary/30 bg-primary/5' : 'bg-muted/40'
                )}
              >
                <IconArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {t('sheet.nextUp')}
                  </div>
                  {nextLesson ? (
                    <div className="truncate">
                      {nextLesson.sequence != null && (
                        <span className="tabular-nums text-muted-foreground">{nextLesson.sequence}. </span>
                      )}
                      {nextLesson.title}
                    </div>
                  ) : nextExam ? (
                    <div className="truncate">{t('sheet.nextExam', { title: nextExam.title })}</div>
                  ) : p.totalLessons === 0 && p.totalExams === 0 ? (
                    <div className="text-muted-foreground">{t('noLessons')}</div>
                  ) : (
                    <div>{t('sheet.allDone')}</div>
                  )}
                </div>
              </div>
            </SheetHeader>

            <div className="space-y-6 py-4">
              {/* Lessons */}
              <section className="space-y-2">
                <SectionTitle count={`${p.lessonsCompleted} / ${p.totalLessons}`}>{t('sheet.lessons')}</SectionTitle>
                {lessons.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('noLessons')}</p>
                ) : (
                  <ol className="space-y-1">
                    {lessons.map((l) => {
                      const done = completedAt.has(l.id)
                      const isNext = l.id === p.nextLessonId
                      return (
                        <li
                          key={l.id}
                          className={cn(
                            'flex items-start gap-2 rounded-md px-2 py-1.5 text-sm',
                            isNext && 'bg-muted/50'
                          )}
                        >
                          {done ? (
                            <IconCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                          ) : (
                            <IconCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground/50" aria-hidden />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className={cn('truncate', !done && 'text-muted-foreground')}>
                              {l.sequence != null && <span className="tabular-nums">{l.sequence}. </span>}
                              {l.title}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {done
                                ? fmtDate(completedAt.get(l.id) ?? null)
                                  ? t('sheet.completedOn', { date: fmtDate(completedAt.get(l.id) ?? null) ?? '' })
                                  : t('sheet.completed')
                                : t('sheet.pending')}
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                )}
              </section>

              {/* Exercises */}
              {exercises.length > 0 && (
                <section className="space-y-2">
                  <SectionTitle count={`${p.exercisesCompleted} / ${p.totalExercises}`}>
                    {t('sheet.exercises')}
                  </SectionTitle>
                  <ul className="space-y-1">
                    {exercises.map((e) => {
                      const done = exerciseDone.has(e.id)
                      return (
                        <li key={e.id} className="flex items-start gap-2 px-2 py-1 text-sm">
                          {done ? (
                            <IconCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                          ) : (
                            <IconCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground/50" aria-hidden />
                          )}
                          <span className={cn('min-w-0 flex-1 truncate', !done && 'text-muted-foreground')}>
                            {e.title}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {done ? t('sheet.completed') : t('sheet.pending')}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )}

              {/* Exams */}
              {exams.length > 0 && (
                <section className="space-y-2">
                  <SectionTitle count={`${p.examsPassed} / ${p.totalExams}`}>{t('sheet.exams')}</SectionTitle>
                  <ul className="space-y-1">
                    {exams.map((e) => {
                      const r = examById.get(e.id)
                      const attempts = r?.attempts ?? 0
                      let verdict: string
                      let tone = 'text-muted-foreground'
                      if (attempts === 0) {
                        verdict = t('sheet.notAttempted')
                      } else if (r?.bestScore == null) {
                        verdict = t('sheet.ungraded')
                        tone = 'text-amber-700 dark:text-amber-400'
                      } else if (r.passed) {
                        verdict = t('sheet.passed', { score: r.bestScore })
                        tone = 'text-primary'
                      } else {
                        verdict = t('sheet.failed', { score: r.bestScore, threshold: EXAM_PASS_SCORE })
                        tone = 'text-destructive'
                      }
                      return (
                        <li key={e.id} className="flex items-start gap-2 px-2 py-1 text-sm">
                          {r?.passed ? (
                            <IconCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                          ) : attempts > 0 && r?.bestScore != null ? (
                            <IconAlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                          ) : (
                            <IconCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground/50" aria-hidden />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className={cn('truncate', attempts === 0 && 'text-muted-foreground')}>{e.title}</div>
                            <div className="text-xs text-muted-foreground">
                              <span className={tone}>{verdict}</span>
                              {/* `exam_submissions` is UNIQUE (exam_id, student_id), so "1 attempt"
                                  would be noise on every row — only a count above one says anything. */}
                              {attempts > 1 && (
                                <>
                                  {' · '}
                                  {t('sheet.attempts', { count: attempts })}
                                </>
                              )}
                              {attempts > 0 && r?.lastAttemptAt && fmtDate(r.lastAttemptAt) && (
                                <>
                                  {' · '}
                                  {fmtDate(r.lastAttemptAt)}
                                </>
                              )}
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
