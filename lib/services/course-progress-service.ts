/**
 * Course Progress Service
 * 
 * Business logic for calculating course completion including lessons AND exams.
 * Pure functions - no side effects, no DB calls.
 * 
 * Progress Calculation:
 * - Course completion requires: ALL lessons complete + ALL exams passed
 * - Exam is "passed" when highest score >= passing_score (teacher-configured)
 * - Multiple attempts allowed (teacher-configured), highest score counts
 */

export interface CourseProgress {
  lessonsCompleted: number
  totalLessons: number
  lessonsPercentage: number
  
  examsPassed: number
  totalExams: number
  examsPercentage: number
  
  overallPercentage: number
  status: 'not_started' | 'in_progress' | 'completed'
}

export interface ExamAttempt {
  submissionId: number
  score: number
  attemptNumber?: number
  submittedAt: Date
}

export interface ExamInfo {
  examId: number
  title: string
  sequence: number
  passingScore: number
  allowRetake: boolean
  attempts: ExamAttempt[]
}

export interface LessonInfo {
  id: number
  title: string
  sequence: number
  completed: boolean
}

/**
 * Calculate overall course progress including lessons and exams
 * 
 * @param totalLessons - Total number of lessons in course
 * @param completedLessons - Number of completed lessons
 * @param exams - Array of exam information with attempts
 * @returns CourseProgress object with detailed metrics
 */
export function calculateCourseProgress(
  totalLessons: number,
  completedLessons: number,
  exams: ExamInfo[]
): CourseProgress {
  // Calculate lesson progress
  const lessonsPercentage = totalLessons > 0 
    ? Math.round((completedLessons / totalLessons) * 100)
    : 100 // If no lessons, consider lessons "complete"

  // Calculate exam progress
  const totalExams = exams.length
  const examsPassed = exams.filter(exam => 
    isExamPassed(exam.attempts, exam.passingScore)
  ).length
  
  const examsPercentage = totalExams > 0
    ? Math.round((examsPassed / totalExams) * 100)
    : 100 // If no exams, consider exams "complete"

  // Overall progress (weighted equally between lessons and exams)
  let overallPercentage: number
  
  if (totalLessons === 0 && totalExams === 0) {
    overallPercentage = 0 // Empty course
  } else if (totalLessons === 0) {
    overallPercentage = examsPercentage // Only exams
  } else if (totalExams === 0) {
    overallPercentage = lessonsPercentage // Only lessons
  } else {
    // Both lessons and exams - average them
    overallPercentage = Math.round((lessonsPercentage + examsPercentage) / 2)
  }

  // Determine status
  let status: 'not_started' | 'in_progress' | 'completed'
  
  if (overallPercentage === 0) {
    status = 'not_started'
  } else if (overallPercentage === 100) {
    status = 'completed'
  } else {
    status = 'in_progress'
  }

  return {
    lessonsCompleted: completedLessons,
    totalLessons: totalLessons,
    lessonsPercentage: lessonsPercentage,
    examsPassed: examsPassed,
    totalExams: totalExams,
    examsPercentage: examsPercentage,
    overallPercentage: overallPercentage,
    status: status,
  }
}

/**
 * Get highest score from multiple exam attempts
 * 
 * @param attempts - Array of exam attempts
 * @returns Highest score achieved, or 0 if no attempts
 */
export function getHighestScore(attempts: ExamAttempt[]): number {
  if (attempts.length === 0) return 0
  
  return Math.max(...attempts.map(a => a.score))
}

/**
 * Check if exam is passed based on highest score
 * 
 * @param attempts - Array of exam attempts
 * @param passingScore - Minimum score required to pass (set by teacher)
 * @returns true if highest score >= passing score
 */
export function isExamPassed(
  attempts: ExamAttempt[], 
  passingScore: number
): boolean {
  const highestScore = getHighestScore(attempts)
  return highestScore >= passingScore
}

/**
 * Get the most recent exam attempt
 * 
 * @param attempts - Array of exam attempts
 * @returns Most recent attempt or null
 */
export function getLatestAttempt(attempts: ExamAttempt[]): ExamAttempt | null {
  if (attempts.length === 0) return null
  
  return attempts.sort((a, b) => 
    b.submittedAt.getTime() - a.submittedAt.getTime()
  )[0]
}

/**
 * Determine the next item (lesson or exam) the student should complete
 * 
 * Logic:
 * 1. Find first incomplete lesson by sequence
 * 2. If all lessons done, find first unpassed exam by sequence
 * 3. If exam allows retake and not passed, include it
 * 
 * @param lessons - Array of lesson info
 * @param exams - Array of exam info
 * @returns Next item to complete or null if course is complete
 */
export function getNextItem(
  lessons: LessonInfo[],
  exams: ExamInfo[]
): { type: 'lesson' | 'exam'; id: number; title: string; sequence: number } | null {
  // Sort lessons by sequence
  const sortedLessons = [...lessons].sort((a, b) => a.sequence - b.sequence)
  
  // Find first incomplete lesson
  const nextLesson = sortedLessons.find(lesson => !lesson.completed)
  
  if (nextLesson) {
    return {
      type: 'lesson',
      id: nextLesson.id,
      title: nextLesson.title,
      sequence: nextLesson.sequence,
    }
  }

  // All lessons complete, check exams
  const sortedExams = [...exams].sort((a, b) => a.sequence - b.sequence)
  
  // Find first exam that's either:
  // 1. Never attempted
  // 2. Not passed but allows retake
  const nextExam = sortedExams.find(exam => {
    const passed = isExamPassed(exam.attempts, exam.passingScore)
    const hasAttempts = exam.attempts.length > 0
    
    return !passed && (!hasAttempts || exam.allowRetake)
  })

  if (nextExam) {
    return {
      type: 'exam',
      id: nextExam.examId,
      title: nextExam.title,
      sequence: nextExam.sequence,
    }
  }

  // Course is complete
  return null
}

/**
 * Get exam status label for UI display
 * 
 * @param exam - Exam info with attempts
 * @returns Status string for display
 */
export function getExamStatusLabel(exam: ExamInfo): string {
  const passed = isExamPassed(exam.attempts, exam.passingScore)
  const hasAttempts = exam.attempts.length > 0
  const highestScore = getHighestScore(exam.attempts)

  if (passed) {
    return `Passed (${highestScore}%)`
  }

  if (hasAttempts && !exam.allowRetake) {
    return `Failed (${highestScore}%) - No retakes`
  }

  if (hasAttempts && exam.allowRetake) {
    return `In Progress (${highestScore}%) - Retake available`
  }

  return 'Not attempted'
}

/**
 * Calculate time estimate to complete course
 * Rough estimate based on remaining lessons and exams
 * 
 * @param remainingLessons - Number of lessons left
 * @param remainingExams - Number of exams left
 * @returns Estimated hours to complete
 */
export function estimateTimeToComplete(
  remainingLessons: number,
  remainingExams: number
): number {
  const MINUTES_PER_LESSON = 30 // Average lesson time
  const MINUTES_PER_EXAM = 60 // Average exam time
  
  const totalMinutes = 
    (remainingLessons * MINUTES_PER_LESSON) + 
    (remainingExams * MINUTES_PER_EXAM)
  
  return Math.round(totalMinutes / 60 * 10) / 10 // Round to 1 decimal
}

/**
 * Get completion status message for display
 * 
 * @param progress - CourseProgress object
 * @returns User-friendly status message
 */
export function getCompletionMessage(progress: CourseProgress): string {
  if (progress.status === 'completed') {
    return 'Congratulations! Course completed 🎉'
  }

  if (progress.status === 'not_started') {
    return 'Ready to start your learning journey'
  }

  // In progress - give helpful context
  const lessonsLeft = progress.totalLessons - progress.lessonsCompleted
  const examsLeft = progress.totalExams - progress.examsPassed

  if (lessonsLeft > 0 && examsLeft > 0) {
    return `${lessonsLeft} lesson${lessonsLeft !== 1 ? 's' : ''} and ${examsLeft} exam${examsLeft !== 1 ? 's' : ''} remaining`
  }

  if (lessonsLeft > 0) {
    return `${lessonsLeft} lesson${lessonsLeft !== 1 ? 's' : ''} remaining`
  }

  if (examsLeft > 0) {
    return `${examsLeft} exam${examsLeft !== 1 ? 's' : ''} remaining`
  }

  return 'Almost there!'
}
