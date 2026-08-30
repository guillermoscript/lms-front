/**
 * Per-student course progress (`lib/analytics/student-progress.ts`, #647).
 *
 * WHY THESE TESTS
 *   The judgement calls a teacher will act on: which student counts as
 *   stalled versus active, that the percentage matches the student's own
 *   course page (lessons only), that an ungraded exam submission is an attempt
 *   but never a score, that a retake's best score wins, that unpublished /
 *   checkpoint items never dilute the denominators, and that a broken source
 *   becomes a visible warning instead of a silent "no activity".
 */

import { describe, it, expect } from 'vitest'
import { createFakeSupabase, type Db as FakeDb } from './support/fake-supabase'
import {
  getCourseProgressReport,
  classifyEngagement,
  STALL_DAYS,
  type CourseProgressReport,
} from '@/lib/analytics/student-progress'

const TENANT = 'tenant-1'
const COURSE = 7
const NOW = new Date('2026-08-30T12:00:00Z')

const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()

const LESSONS = [
  { id: 1, title: 'Intro', sequence: 1 },
  { id: 2, title: 'Setup', sequence: 2 },
  { id: 3, title: 'Deep dive', sequence: 3 },
  { id: 4, title: 'Wrap up', sequence: 4 },
]
const EXERCISES = [
  { id: 10, title: 'Ex A', sequence: null },
  { id: 11, title: 'Ex B', sequence: null },
]
const EXAMS = [{ id: 100, title: 'Final', sequence: 1 }]

function emptyDb(): FakeDb {
  return {
    lesson_completions: [],
    exercise_completions: [],
    exam_submissions: [],
    lesson_checkpoint_attempts: [],
    practice_attempts: [],
  }
}

async function run(
  db: FakeDb,
  userIds: string[],
  overrides: Partial<Parameters<typeof getCourseProgressReport>[1]> = {}
): Promise<CourseProgressReport> {
  const { client } = createFakeSupabase(db)
  return getCourseProgressReport(client as never, {
    courseId: COURSE,
    tenantId: TENANT,
    userIds,
    lessons: LESSONS,
    exercises: EXERCISES,
    exams: EXAMS,
    now: NOW,
    ...overrides,
  })
}

const student = (r: CourseProgressReport, id: string) => {
  const s = r.students.find((x) => x.userId === id)
  if (!s) throw new Error(`no row for ${id}`)
  return s
}

describe('classifyEngagement', () => {
  const base = { totalLessons: 4, totalExams: 1, now: NOW }

  it('is not_started when there is no activity at all', () => {
    expect(
      classifyEngagement({ ...base, lessonsCompleted: 0, examsPassed: 0, lastActivityAt: null })
    ).toBe('not_started')
  })

  it('is active while the latest activity is inside the stall window', () => {
    expect(
      classifyEngagement({
        ...base,
        lessonsCompleted: 1,
        examsPassed: 0,
        lastActivityAt: daysAgo(STALL_DAYS - 1),
      })
    ).toBe('active')
  })

  it('is stalled once the latest activity is STALL_DAYS old', () => {
    expect(
      classifyEngagement({
        ...base,
        lessonsCompleted: 1,
        examsPassed: 0,
        lastActivityAt: daysAgo(STALL_DAYS),
      })
    ).toBe('stalled')
  })

  it('is completed only when every lesson is done AND every exam is passed', () => {
    expect(
      classifyEngagement({ ...base, lessonsCompleted: 4, examsPassed: 0, lastActivityAt: daysAgo(40) })
    ).toBe('stalled')
    expect(
      classifyEngagement({ ...base, lessonsCompleted: 4, examsPassed: 1, lastActivityAt: daysAgo(40) })
    ).toBe('completed')
  })

  it('never calls an empty course completed', () => {
    expect(
      classifyEngagement({
        totalLessons: 0,
        totalExams: 0,
        lessonsCompleted: 0,
        examsPassed: 0,
        lastActivityAt: daysAgo(1),
        now: NOW,
      })
    ).toBe('active')
  })
})

describe('getCourseProgressReport', () => {
  it('reports every enrolled student, even with no rows anywhere', async () => {
    const r = await run(emptyDb(), ['u1', 'u2'])
    expect(r.students).toHaveLength(2)
    expect(student(r, 'u1')).toMatchObject({
      overallPercentage: 0,
      lessonsCompleted: 0,
      totalLessons: 4,
      exercisesCompleted: 0,
      totalExercises: 2,
      examsPassed: 0,
      totalExams: 1,
      lastActivityAt: null,
      status: 'not_started',
      nextLessonId: 1,
    })
    expect(r.summary).toEqual({
      total: 2,
      byStatus: { not_started: 2, active: 0, stalled: 0, completed: 0 },
      avgProgress: 0,
    })
    expect(r.warnings).toEqual([])
  })

  it('percentage is lessons-only — the figure the student sees on their own course page', async () => {
    const db = emptyDb()
    db.lesson_completions = [
      { id: 1, user_id: 'u1', lesson_id: 1, completed_at: daysAgo(3) },
      { id: 2, user_id: 'u1', lesson_id: 2, completed_at: daysAgo(2) },
    ]
    // A passed exam must NOT lift the percentage above 2/4.
    db.exam_submissions = [
      { submission_id: 1, tenant_id: TENANT, student_id: 'u1', exam_id: 100, score: 95, submission_date: daysAgo(1) },
    ]
    const s = student(await run(db, ['u1']), 'u1')
    expect(s.overallPercentage).toBe(50)
    expect(s.examsPassed).toBe(1)
    expect(s.nextLessonId).toBe(3)
  })

  it('ignores completions for lessons/exercises that are not in the published set', async () => {
    const db = emptyDb()
    db.lesson_completions = [
      { id: 1, user_id: 'u1', lesson_id: 999, completed_at: daysAgo(1) }, // draft / other course
      { id: 2, user_id: 'u1', lesson_id: 1, completed_at: daysAgo(1) },
    ]
    db.exercise_completions = [
      { id: 1, user_id: 'u1', exercise_id: 555, completed_at: daysAgo(1) }, // checkpoint-embedded
      { id: 2, user_id: 'u1', exercise_id: 10, completed_at: daysAgo(1) },
    ]
    const s = student(await run(db, ['u1']), 'u1')
    expect(s.lessonsCompleted).toBe(1)
    expect(s.completedLessons.map((c) => c.lessonId)).toEqual([1])
    expect(s.exercisesCompleted).toBe(1)
    expect(s.completedExerciseIds).toEqual([10])
  })

  it('an ungraded exam submission is an attempt but not a score', async () => {
    const db = emptyDb()
    db.exam_submissions = [
      { submission_id: 1, tenant_id: TENANT, student_id: 'u1', exam_id: 100, score: null, submission_date: daysAgo(1) },
    ]
    const s = student(await run(db, ['u1']), 'u1')
    expect(s.exams[0]).toMatchObject({ examId: 100, attempts: 1, bestScore: null, passed: false })
    // The submission still counts as activity.
    expect(s.lastActivityAt).toBe(daysAgo(1))
    expect(s.status).toBe('active')
  })

  it('a retake keeps the best score and the latest attempt date', async () => {
    const db = emptyDb()
    db.exam_submissions = [
      { submission_id: 1, tenant_id: TENANT, student_id: 'u1', exam_id: 100, score: 40, submission_date: daysAgo(10) },
      { submission_id: 2, tenant_id: TENANT, student_id: 'u1', exam_id: 100, score: 85, submission_date: daysAgo(5) },
      { submission_id: 3, tenant_id: TENANT, student_id: 'u1', exam_id: 100, score: 60, submission_date: daysAgo(2) },
    ]
    const s = student(await run(db, ['u1']), 'u1')
    expect(s.exams[0]).toMatchObject({ attempts: 3, bestScore: 85, passed: true, lastAttemptAt: daysAgo(2) })
  })

  it('a score below 70 is not a pass', async () => {
    const db = emptyDb()
    db.exam_submissions = [
      { submission_id: 1, tenant_id: TENANT, student_id: 'u1', exam_id: 100, score: 69, submission_date: daysAgo(1) },
    ]
    expect(student(await run(db, ['u1']), 'u1').exams[0].passed).toBe(false)
  })

  it('last activity is the latest stamp across every source', async () => {
    const db = emptyDb()
    db.lesson_completions = [{ id: 1, user_id: 'u1', lesson_id: 1, completed_at: daysAgo(20) }]
    db.lesson_checkpoint_attempts = [
      { id: 1, tenant_id: TENANT, course_id: COURSE, user_id: 'u1', created_at: daysAgo(30) },
    ]
    db.practice_attempts = [
      { id: 1, tenant_id: TENANT, course_id: COURSE, user_id: 'u1', created_at: daysAgo(4) },
      // Another course's drill must not count.
      { id: 2, tenant_id: TENANT, course_id: 999, user_id: 'u1', created_at: daysAgo(0) },
    ]
    const s = student(await run(db, ['u1']), 'u1')
    expect(s.lastActivityAt).toBe(daysAgo(4))
    expect(s.status).toBe('active')
  })

  it('a student with old progress and nothing recent is stalled', async () => {
    const db = emptyDb()
    db.lesson_completions = [{ id: 1, user_id: 'u1', lesson_id: 1, completed_at: daysAgo(STALL_DAYS + 3) }]
    const s = student(await run(db, ['u1']), 'u1')
    expect(s.status).toBe('stalled')
  })

  it('completed needs all published lessons and every exam passed', async () => {
    const db = emptyDb()
    db.lesson_completions = LESSONS.map((l, i) => ({
      id: i + 1,
      user_id: 'u1',
      lesson_id: l.id,
      completed_at: daysAgo(60),
    }))
    let s = student(await run(db, ['u1']), 'u1')
    expect(s.overallPercentage).toBe(100)
    expect(s.status).toBe('stalled') // exam still open
    expect(s.nextLessonId).toBeNull()

    db.exam_submissions = [
      { submission_id: 1, tenant_id: TENANT, student_id: 'u1', exam_id: 100, score: 70, submission_date: daysAgo(59) },
    ]
    s = student(await run(db, ['u1']), 'u1')
    expect(s.status).toBe('completed')
  })

  it('builds the lesson funnel from the cohort, in sequence order', async () => {
    const db = emptyDb()
    db.lesson_completions = [
      { id: 1, user_id: 'u1', lesson_id: 1, completed_at: daysAgo(1) },
      { id: 2, user_id: 'u1', lesson_id: 2, completed_at: daysAgo(1) },
      { id: 3, user_id: 'u2', lesson_id: 1, completed_at: daysAgo(1) },
      { id: 4, user_id: 'u3', lesson_id: 1, completed_at: daysAgo(1) },
      { id: 5, user_id: 'u3', lesson_id: 2, completed_at: daysAgo(1) },
      { id: 6, user_id: 'u3', lesson_id: 3, completed_at: daysAgo(1) },
    ]
    const r = await run(db, ['u1', 'u2', 'u3'], {
      // Deliberately out of order to prove the sort.
      lessons: [LESSONS[2], LESSONS[0], LESSONS[3], LESSONS[1]],
    })
    expect(r.lessonFunnel.map((f) => [f.id, f.completedBy])).toEqual([
      [1, 3],
      [2, 2],
      [3, 1],
      [4, 0],
    ])
    expect(r.summary.avgProgress).toBe(Math.round((50 + 25 + 75) / 3))
  })

  it('a source that fails becomes a warning, not silent zeros', async () => {
    const db = emptyDb()
    db.lesson_completions = [{ id: 1, user_id: 'u1', lesson_id: 1, completed_at: daysAgo(1) }]
    const { client } = createFakeSupabase(db)
    const broken = {
      from(table: string) {
        if (table === 'exam_submissions') throw new Error('permission denied for table exam_submissions')
        return client.from(table)
      },
    }
    const r = await getCourseProgressReport(broken as never, {
      courseId: COURSE,
      tenantId: TENANT,
      userIds: ['u1'],
      lessons: LESSONS,
      exercises: EXERCISES,
      exams: EXAMS,
      now: NOW,
    })
    expect(r.warnings).toHaveLength(1)
    expect(r.warnings[0]).toMatch(/^exam_submissions: /)
    // The sources that did load still count.
    expect(student(r, 'u1').lessonsCompleted).toBe(1)
  })

  it('dedupes user ids and skips reads when there is nothing to read', async () => {
    const r = await run(emptyDb(), ['u1', 'u1'], { lessons: [], exercises: [], exams: [] })
    expect(r.students).toHaveLength(1)
    expect(r.students[0]).toMatchObject({ overallPercentage: 0, totalLessons: 0, status: 'not_started' })
    expect(r.lessonFunnel).toEqual([])
  })

  it('pages through a cohort larger than one .in() chunk', async () => {
    const db = emptyDb()
    const ids = Array.from({ length: 450 }, (_, i) => `u${i}`)
    db.lesson_completions = ids.map((u, i) => ({ id: i + 1, user_id: u, lesson_id: 1, completed_at: daysAgo(1) }))
    const r = await run(db, ids)
    expect(r.students).toHaveLength(450)
    expect(r.lessonFunnel[0].completedBy).toBe(450)
    expect(r.sources.lessonCompletions).toBe(450)
  })
})
