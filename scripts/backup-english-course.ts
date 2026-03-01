import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJFUzI1NiIsImtpZCI6ImI4MTI2OWYxLTIxZDgtNGYyZS1iNzE5LWMyMjQwYTg0MGQ5MCIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MjA4NTE4MzQwNX0.6S_JislZTa8t8apwlrkOtDM9BYSVXVJ_LGvLJwPuzFTbBXf4HrnsteXxNbIZF0KAX0iKXOPSkYXWJP4xTjwdPA'

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function backupCourse() {
  console.log('📦 Backing up English course data...')

  try {
    // Fetch all courses
    const { data: courses, error: coursesError } = await supabase
      .from('courses')
      .select('*')
      .order('id')

    if (coursesError) throw coursesError

    console.log(`Found ${courses?.length || 0} courses`)

    // For each course, fetch related data
    const coursesWithData = await Promise.all(
      (courses || []).map(async (course) => {
        // Fetch lessons
        const { data: lessons } = await supabase
          .from('lessons')
          .select('*')
          .eq('course_id', course.id)
          .order('sequence')

        // Fetch exercises for each lesson
        const lessonsWithExercises = await Promise.all(
          (lessons || []).map(async (lesson) => {
            const { data: exercises } = await supabase
              .from('exercises')
              .select('*')
              .eq('lesson_id', lesson.id)
              .order('sequence')

            return { ...lesson, exercises: exercises || [] }
          })
        )

        // Fetch exams
        const { data: exams } = await supabase
          .from('exams')
          .select('*')
          .eq('course_id', course.id)

        // Fetch exam questions for each exam
        const examsWithQuestions = await Promise.all(
          (exams || []).map(async (exam) => {
            const { data: questions } = await supabase
              .from('exam_questions')
              .select('*')
              .eq('exam_id', exam.id)
              .order('sequence')

            // Fetch options for each question
            const questionsWithOptions = await Promise.all(
              (questions || []).map(async (question) => {
                const { data: options } = await supabase
                  .from('question_options')
                  .select('*')
                  .eq('question_id', question.id)
                  .order('sequence')

                return { ...question, options: options || [] }
              })
            )

            return { ...exam, questions: questionsWithOptions }
          })
        )

        return {
          ...course,
          lessons: lessonsWithExercises,
          exams: examsWithQuestions
        }
      })
    )

    // Save to file
    const backupPath = path.join(process.cwd(), 'supabase', 'backup-courses.json')
    fs.writeFileSync(backupPath, JSON.stringify(coursesWithData, null, 2))

    console.log(`✅ Backup saved to: ${backupPath}`)
    console.log(`\nCourses backed up:`)
    coursesWithData.forEach(c => {
      console.log(`  - ${c.title} (${c.lessons?.length || 0} lessons, ${c.exams?.length || 0} exams)`)
    })

  } catch (error) {
    console.error('❌ Backup failed:', error)
    process.exit(1)
  }
}

backupCourse()
