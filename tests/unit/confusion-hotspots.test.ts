/**
 * Confusion hotspots aggregation (`lib/analytics/confusion-hotspots.ts`).
 *
 * WHY THESE TESTS
 *   The local database had zero rows in every source table, so the manual QA
 *   pass could only ever exercise the practice and exercise paths with one
 *   student. Exam questions, lesson checkpoints, the `fetchAllRows` paging
 *   loop, and the warning path all shipped unverified. These cover them.
 *
 *   The assertions are about JUDGEMENT, not plumbing: which student counts as
 *   stuck, which answer counts as missed, which retake wins, and — the whole
 *   point of the feature — when a teacher's difficulty label contradicts the
 *   rating the platform measured.
 */

import { describe, it, expect } from 'vitest'
import { createFakeSupabase, type Db as FakeDb } from './support/fake-supabase'
import {
  getConfusionHotspots,
  difficultyMismatch,
  type ConfusionHotspots,
} from '@/lib/analytics/confusion-hotspots'

const TENANT = 'tenant-1'
const COURSE = 101

/** Recent enough to sit inside any look-back window the tests use. */
const recent = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 86_400_000).toISOString()

function emptyDb(): FakeDb {
  return {
    practice_attempts: [],
    exercise_evaluations: [],
    lesson_checkpoint_attempts: [],
    exam_submissions: [],
    exam_question_scores: [],
    exam_questions: [],
    exams: [],
    exercises: [],
    item_ratings: [],
  }
}

async function run(db: FakeDb, days = 30): Promise<ConfusionHotspots> {
  const { client } = createFakeSupabase(db)
  return getConfusionHotspots(client as never, { courseId: COURSE, tenantId: TENANT, days })
}

const bySc = (r: ConfusionHotspots, scope: string) => r.hotspots.filter((h) => h.scope === scope)

describe('difficultyMismatch', () => {
  it('flags an item labelled easy that plays hard', () => {
    expect(difficultyMismatch('easy', 1780)).toBe('harder_than_labeled')
  })

  it('flags an item labelled hard that everyone passes', () => {
    expect(difficultyMismatch('hard', 1300)).toBe('easier_than_labeled')
  })

  it('never calls an easy item "easier than labelled" — that is the label working', () => {
    expect(difficultyMismatch('easy', 1200)).toBeNull()
    expect(difficultyMismatch('easy', 900)).toBeNull()
  })

  it('never calls a hard item "harder than labelled"', () => {
    expect(difficultyMismatch('hard', 2100)).toBeNull()
  })

  it('leaves items inside their band alone, and unlabelled items unjudged', () => {
    expect(difficultyMismatch('medium', 1500)).toBeNull()
    expect(difficultyMismatch('medium', 1680)).toBeNull()
    expect(difficultyMismatch('medium', 1681)).toBe('harder_than_labeled')
    expect(difficultyMismatch(null, 9999)).toBeNull()
  })
})

describe('exercise hotspots', () => {
  const exercises = [{ id: 1, title: 'Memoize the list', lesson_id: 7, course_id: COURSE, tenant_id: TENANT }]

  it('judges a student by their LATEST attempt, not their first', async () => {
    const db = emptyDb()
    db.exercises = exercises
    db.exercise_evaluations = [
      // Failed twice then passed — they got there, so they are not stuck.
      { id: 1, exercise_id: 1, user_id: 'u1', tenant_id: TENANT, attempt_number: 1, passed: false, score: 20, created_at: recent(5) },
      { id: 2, exercise_id: 1, user_id: 'u1', tenant_id: TENANT, attempt_number: 2, passed: false, score: 50, created_at: recent(4) },
      { id: 3, exercise_id: 1, user_id: 'u1', tenant_id: TENANT, attempt_number: 3, passed: true, score: 95, created_at: recent(3) },
      // Still failing on their most recent try.
      { id: 4, exercise_id: 1, user_id: 'u2', tenant_id: TENANT, attempt_number: 1, passed: false, score: 30, created_at: recent(2) },
    ]

    const hot = bySc(await run(db), 'exercise')
    expect(hot).toHaveLength(1)
    expect(hot[0].studentsAffected).toBe(1)
    expect(hot[0].studentsAttempted).toBe(2)
  })

  it('counts attempts from the whole history — "passed, but on the sixth try" is the signal', async () => {
    const db = emptyDb()
    db.exercises = exercises
    db.exercise_evaluations = [
      ...Array.from({ length: 6 }, (_, i) => ({
        id: i + 1,
        exercise_id: 1,
        user_id: 'u1',
        tenant_id: TENANT,
        attempt_number: i + 1,
        passed: false,
        score: 10 * i,
        created_at: recent(10 - i),
      })),
      { id: 7, exercise_id: 1, user_id: 'u2', tenant_id: TENANT, attempt_number: 1, passed: false, score: 5, created_at: recent(1) },
    ]

    const hot = bySc(await run(db), 'exercise')[0]
    // u1 peaked at attempt 6, u2 at attempt 1 → mean 3.5
    expect(hot.avgAttempts).toBe(3.5)
    // Attempt totals are a practice-only counter; exercises report the mean.
    expect(hot.totalAttempts).toBeNull()
  })

  it('reports no hotspot when everyone eventually passes', async () => {
    const db = emptyDb()
    db.exercises = exercises
    db.exercise_evaluations = [
      { id: 1, exercise_id: 1, user_id: 'u1', tenant_id: TENANT, attempt_number: 1, passed: true, score: 90, created_at: recent(2) },
    ]
    expect(bySc(await run(db), 'exercise')).toHaveLength(0)
  })

  it('ignores another tenant’s attempts on the same exercise id', async () => {
    const db = emptyDb()
    db.exercises = exercises
    db.exercise_evaluations = [
      { id: 1, exercise_id: 1, user_id: 'spy', tenant_id: 'other-tenant', attempt_number: 1, passed: false, score: 0, created_at: recent(1) },
    ]
    expect(bySc(await run(db), 'exercise')).toHaveLength(0)
  })
})

describe('exam-question hotspots', () => {
  const base = (): FakeDb => {
    const db = emptyDb()
    db.exams = [{ exam_id: 50, title: 'Midterm', course_id: COURSE, tenant_id: TENANT }]
    db.exam_questions = [{ question_id: 900, question_text: 'Why does the effect re-run?', exam_id: 50 }]
    return db
  }

  it('counts a partially-credited answer as missed below 70% of the points', async () => {
    const db = base()
    db.exam_submissions = [
      { submission_id: 1, student_id: 'u1', exam_id: 50, tenant_id: TENANT, submission_date: recent(2) },
      { submission_id: 2, student_id: 'u2', exam_id: 50, tenant_id: TENANT, submission_date: recent(2) },
    ]
    db.exam_question_scores = [
      // 6/10 = 60% → missed, even though is_correct is not false.
      { score_id: 1, submission_id: 1, question_id: 900, is_correct: null, points_earned: 6, points_possible: 10 },
      // 7/10 = exactly the threshold → not missed.
      { score_id: 2, submission_id: 2, question_id: 900, is_correct: null, points_earned: 7, points_possible: 10 },
    ]

    const hot = bySc(await run(db), 'exam_question')
    expect(hot).toHaveLength(1)
    expect(hot[0].studentsAffected).toBe(1)
    expect(hot[0].label).toBe('Midterm: Why does the effect re-run?')
  })

  it('scores only a student’s latest retake, so a fixed mistake stops counting', async () => {
    const db = base()
    db.exam_submissions = [
      // Deliberately inserted newest-first: selection must go by date, not order.
      { submission_id: 2, student_id: 'u1', exam_id: 50, tenant_id: TENANT, submission_date: recent(1) },
      { submission_id: 1, student_id: 'u1', exam_id: 50, tenant_id: TENANT, submission_date: recent(9) },
    ]
    db.exam_question_scores = [
      { score_id: 1, submission_id: 1, question_id: 900, is_correct: false, points_earned: 0, points_possible: 10 },
      { score_id: 2, submission_id: 2, question_id: 900, is_correct: true, points_earned: 10, points_possible: 10 },
    ]

    const result = await run(db)
    expect(bySc(result, 'exam_question')).toHaveLength(0)
    // Both rows are read, but only one counts as the student's standing result.
    expect(result.sources.examSubmissions).toBe(1)
  })

  it('drops submissions with no date — the window filter excludes them upstream', async () => {
    // Documents real PostgREST behaviour: `submission_date >= cutoff` is never
    // true for NULL, so an undated submission cannot reach the retake logic at
    // all. Worth pinning, because it means an undated row is invisible here
    // rather than being treated as a student's latest word.
    const db = base()
    db.exam_submissions = [
      { submission_id: 1, student_id: 'u1', exam_id: 50, tenant_id: TENANT, submission_date: null },
    ]
    db.exam_question_scores = [
      { score_id: 1, submission_id: 1, question_id: 900, is_correct: false, points_earned: 0, points_possible: 10 },
    ]

    const result = await run(db)
    expect(result.sources.examSubmissions).toBe(0)
    expect(bySc(result, 'exam_question')).toHaveLength(0)
  })

  it('treats is_correct=false as missed regardless of points', async () => {
    const db = base()
    db.exam_submissions = [
      { submission_id: 1, student_id: 'u1', exam_id: 50, tenant_id: TENANT, submission_date: recent(1) },
    ]
    db.exam_question_scores = [
      { score_id: 1, submission_id: 1, question_id: 900, is_correct: false, points_earned: null, points_possible: null },
    ]
    expect(bySc(await run(db), 'exam_question')).toHaveLength(1)
  })
})

describe('lesson-checkpoint hotspots', () => {
  it('rolls checkpoints up by their gating exercise title', async () => {
    const db = emptyDb()
    db.exercises = [{ id: 3, title: 'Predict the output', lesson_id: 12, course_id: COURSE, tenant_id: TENANT }]
    db.lesson_checkpoint_attempts = [
      { id: 1, checkpoint_id: 77, exercise_id: 3, lesson_id: 12, user_id: 'u1', tenant_id: TENANT, course_id: COURSE, attempt_number: 1, passed: false, score: 30, created_at: recent(2) },
      { id: 2, checkpoint_id: 77, exercise_id: 3, lesson_id: 12, user_id: 'u2', tenant_id: TENANT, course_id: COURSE, attempt_number: 1, passed: false, score: 40, created_at: recent(1) },
      { id: 3, checkpoint_id: 77, exercise_id: 3, lesson_id: 12, user_id: 'u3', tenant_id: TENANT, course_id: COURSE, attempt_number: 1, passed: true, score: 88, created_at: recent(1) },
    ]

    const hot = bySc(await run(db), 'checkpoint')
    expect(hot).toHaveLength(1)
    expect(hot[0].label).toBe('Predict the output')
    expect(hot[0].lessonId).toBe(12)
    expect(hot[0].studentsAffected).toBe(2)
    expect(hot[0].studentsAttempted).toBe(3)
  })
})

describe('practice-topic hotspots', () => {
  it('flags a topic by its mean score and the students below the floor', async () => {
    const db = emptyDb()
    db.practice_attempts = [
      { id: 1, topic: 'Loops', lesson_id: 4, score: 30, user_id: 'u1', tenant_id: TENANT, course_id: COURSE, created_at: recent(2) },
      { id: 2, topic: 'Loops', lesson_id: 4, score: 50, user_id: 'u2', tenant_id: TENANT, course_id: COURSE, created_at: recent(2) },
      { id: 3, topic: 'Loops', lesson_id: 4, score: 100, user_id: 'u3', tenant_id: TENANT, course_id: COURSE, created_at: recent(1) },
    ]

    const hot = bySc(await run(db), 'practice')[0]
    expect(hot.avgScore).toBe(60)
    expect(hot.studentsAffected).toBe(2)
    expect(hot.lessonId).toBe(4)
    // The page renders this count, so it must be attempts and not students.
    expect(hot.totalAttempts).toBe(3)
    expect(hot.studentsAttempted).toBe(3)
  })

  it('excludes attempts older than the look-back window', async () => {
    const db = emptyDb()
    db.practice_attempts = [
      { id: 1, topic: 'Loops', lesson_id: 4, score: 10, user_id: 'u1', tenant_id: TENANT, course_id: COURSE, created_at: recent(60) },
    ]
    expect((await run(db, 30)).hotspots).toHaveLength(0)
    expect((await run(db, 90)).hotspots).toHaveLength(1)
  })
})

describe('severity ranking', () => {
  it('puts a whole-class failure above a single stuck student', async () => {
    const db = emptyDb()
    db.exercises = [
      { id: 1, title: 'Everyone fails this', lesson_id: null, course_id: COURSE, tenant_id: TENANT },
      { id: 2, title: 'One person stuck', lesson_id: null, course_id: COURSE, tenant_id: TENANT },
    ]
    db.exercise_evaluations = [
      ...['a', 'b', 'c', 'd'].map((u, i) => ({
        id: i + 1, exercise_id: 1, user_id: u, tenant_id: TENANT,
        attempt_number: 1, passed: false, score: 10, created_at: recent(1),
      })),
      { id: 10, exercise_id: 2, user_id: 'a', tenant_id: TENANT, attempt_number: 1, passed: false, score: 10, created_at: recent(1) },
      ...['b', 'c', 'd', 'e'].map((u, i) => ({
        id: 20 + i, exercise_id: 2, user_id: u, tenant_id: TENANT,
        attempt_number: 1, passed: true, score: 90, created_at: recent(1),
      })),
    ]

    const result = await run(db)
    expect(result.hotspots[0].label).toBe('Everyone fails this')
    expect(result.hotspots[0].severity).toBeGreaterThan(result.hotspots[1].severity)
  })
})

describe('hardest items (difficulty calibration)', () => {
  it('ranks by measured rating and surfaces the label contradiction', async () => {
    const db = emptyDb()
    db.exercises = [
      { id: 1, title: 'Labelled easy', lesson_id: null, course_id: COURSE, tenant_id: TENANT, difficulty_level: 'easy' },
      { id: 2, title: 'Labelled hard', lesson_id: null, course_id: COURSE, tenant_id: TENANT, difficulty_level: 'hard' },
    ]
    db.item_ratings = [
      { item_type: 'exercise', item_id: 1, rating: 1790, attempt_count: 31, tenant_id: TENANT, course_id: COURSE },
      { item_type: 'exercise', item_id: 2, rating: 1300, attempt_count: 40, tenant_id: TENANT, course_id: COURSE },
    ]

    const { hardestItems } = await run(db)
    expect(hardestItems.map((i) => i.title)).toEqual(['Labelled easy', 'Labelled hard'])
    expect(hardestItems[0].mismatch).toBe('harder_than_labeled')
    expect(hardestItems[1].mismatch).toBe('easier_than_labeled')
  })

  it('ignores items with too few attempts to be meaningful', async () => {
    const db = emptyDb()
    db.exercises = [{ id: 1, title: 'Barely tried', lesson_id: null, course_id: COURSE, tenant_id: TENANT, difficulty_level: 'easy' }]
    db.item_ratings = [
      { item_type: 'exercise', item_id: 1, rating: 1900, attempt_count: 2, tenant_id: TENANT, course_id: COURSE },
    ]
    expect((await run(db)).hardestItems).toHaveLength(0)
  })

  it('never claims a mismatch for an exam question, which carries no label', async () => {
    const db = emptyDb()
    db.exam_questions = [{ question_id: 900, question_text: 'A hard question', exam_id: 50 }]
    db.item_ratings = [
      { item_type: 'exam_question', item_id: 900, rating: 1900, attempt_count: 12, tenant_id: TENANT, course_id: COURSE },
    ]
    const [item] = (await run(db)).hardestItems
    expect(item.declaredDifficulty).toBeNull()
    expect(item.mismatch).toBeNull()
  })
})

describe('completeness and failure reporting', () => {
  it('pages past the PostgREST row cap instead of stopping at the first full page', async () => {
    const db = emptyDb()
    // 1200 rows > the 500-row page size, so this only passes if range() loops.
    db.practice_attempts = Array.from({ length: 1200 }, (_, i) => ({
      id: i + 1,
      topic: 'Loops',
      lesson_id: 4,
      score: 10,
      user_id: `u${i}`,
      tenant_id: TENANT,
      course_id: COURSE,
      created_at: recent(1),
    }))

    const result = await run(db)
    expect(result.sources.practiceAttempts).toBe(1200)
    expect(result.warnings).toEqual([])
  })

  it('reports a failed signal as a named warning rather than an empty list', async () => {
    const db = emptyDb()
    db.exercises = [{ id: 1, title: 'Fine', lesson_id: null, course_id: COURSE, tenant_id: TENANT }]
    db.exercise_evaluations = [
      { id: 1, exercise_id: 1, user_id: 'u1', tenant_id: TENANT, attempt_number: 1, passed: false, score: 10, created_at: recent(1) },
    ]

    const { client } = createFakeSupabase(db)
    // Only the practice read fails — the rest of the page must still work.
    const brittle = {
      from: (table: string) => {
        if (table === 'practice_attempts') throw new Error('permission denied for table practice_attempts')
        return (client as never as { from: (t: string) => unknown }).from(table)
      },
    }

    const result = await getConfusionHotspots(brittle as never, {
      courseId: COURSE,
      tenantId: TENANT,
      days: 30,
    })

    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('Practice drills')
    expect(result.warnings[0]).toContain('permission denied')
    // The surviving signal is still reported — one bad table does not blank the page.
    expect(bySc(result, 'exercise')).toHaveLength(1)
  })

  it('returns an all-clear with no warnings when there is simply no activity', async () => {
    const result = await run(emptyDb())
    expect(result.hotspots).toEqual([])
    expect(result.hardestItems).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.sources.practiceAttempts).toBe(0)
  })
})
