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

async function restoreCourse() {
  console.log('📥 Restoring English course data...')

  try {
    const backupPath = path.join(process.cwd(), 'supabase', 'backup-courses.json')
    
    if (!fs.existsSync(backupPath)) {
      console.error('❌ No backup file found at:', backupPath)
      console.log('Run npm run backup-course first!')
      process.exit(1)
    }

    const coursesWithData = JSON.parse(fs.readFileSync(backupPath, 'utf-8'))

    for (const courseData of coursesWithData) {
      console.log(`\nRestoring course: ${courseData.title}`)

      const { lessons, exams, ...course } = courseData

      // Remove auto-generated fields
      delete course.created_at
      delete course.updated_at

      // Insert course
      const { data: insertedCourse, error: courseError } = await supabase
        .from('courses')
        .insert(course)
        .select()
        .single()

      if (courseError) {
        console.error('Course error:', courseError)
        continue
      }

      console.log(`✅ Course created with ID: ${insertedCourse.id}`)

      // Restore lessons
      for (const lessonData of lessons || []) {
        const { exercises, ...lesson } = lessonData
        delete lesson.id
        delete lesson.created_at
        delete lesson.updated_at
        lesson.course_id = insertedCourse.id

        const { data: insertedLesson, error: lessonError } = await supabase
          .from('lessons')
          .insert(lesson)
          .select()
          .single()

        if (lessonError) {
          console.error('Lesson error:', lessonError)
          continue
        }

        console.log(`  ✅ Lesson: ${lesson.title}`)

        // Restore exercises
        for (const exerciseData of exercises || []) {
          const exercise = { ...exerciseData }
          delete exercise.id
          delete exercise.created_at
          delete exercise.updated_at
          exercise.lesson_id = insertedLesson.id

          const { error: exerciseError } = await supabase
            .from('exercises')
            .insert(exercise)

          if (exerciseError) {
            console.error('Exercise error:', exerciseError)
          } else {
            console.log(`    ✅ Exercise: ${exercise.title}`)
          }
        }
      }

      // Restore exams
      for (const examData of exams || []) {
        const { questions, ...exam } = examData
        delete exam.id
        delete exam.created_at
        delete exam.updated_at
        exam.course_id = insertedCourse.id

        const { data: insertedExam, error: examError } = await supabase
          .from('exams')
          .insert(exam)
          .select()
          .single()

        if (examError) {
          console.error('Exam error:', examError)
          continue
        }

        console.log(`  ✅ Exam: ${exam.title}`)

        // Restore questions
        for (const questionData of questions || []) {
          const { options, ...question } = questionData
          delete question.id
          delete question.created_at
          delete question.updated_at
          question.exam_id = insertedExam.id

          const { data: insertedQuestion, error: questionError } = await supabase
            .from('exam_questions')
            .insert(question)
            .select()
            .single()

          if (questionError) {
            console.error('Question error:', questionError)
            continue
          }

          // Restore options
          for (const optionData of options || []) {
            const option = { ...optionData }
            delete option.id
            delete option.created_at
            delete option.updated_at
            option.question_id = insertedQuestion.id

            const { error: optionError } = await supabase
              .from('question_options')
              .insert(option)

            if (optionError) {
              console.error('Option error:', optionError)
            }
          }

          console.log(`    ✅ Question: ${question.question_text?.substring(0, 50)}...`)
        }
      }
    }

    console.log('\n✅ Restore complete!')

  } catch (error) {
    console.error('❌ Restore failed:', error)
    process.exit(1)
  }
}

restoreCourse()
