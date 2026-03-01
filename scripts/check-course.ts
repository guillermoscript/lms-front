import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'http://127.0.0.1:54321'
const supabaseServiceKey = 'eyJhbGciOiJFUzI1NiIsImtpZCI6ImI4MTI2OWYxLTIxZDgtNGYyZS1iNzE5LWMyMjQwYTg0MGQ5MCIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MjA4NTE4MzQwNX0.6S_JislZTa8t8apwlrkOtDM9BYSVXVJ_LGvLJwPuzFTbBXf4HrnsteXxNbIZF0KAX0iKXOPSkYXWJP4xTjwdPA'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkCourse() {
  console.log('Checking course data...')

  // Get all courses
  const { data: courses, error: coursesError } = await supabase
    .from('courses')
    .select('*')

  console.log('\nCourses:', courses)
  if (coursesError) console.error('Courses error:', coursesError)

  // Get enrollments for student
  const { data: users } = await supabase.auth.admin.listUsers()
  const student = users?.users.find(u => u.email === 'student@test.com')

  if (student) {
    console.log('\nStudent ID:', student.id)

    const { data: enrollments, error: enrollError } = await supabase
      .from('enrollments')
      .select('*')
      .eq('user_id', student.id)

    console.log('\nEnrollments:', enrollments)
    if (enrollError) console.error('Enrollments error:', enrollError)
  }
}

checkCourse()
