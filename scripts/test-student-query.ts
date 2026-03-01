import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'http://127.0.0.1:54321'
const supabaseAnonKey = 'eyJhbGciOiJFUzI1NiIsImtpZCI6ImI4MTI2OWYxLTIxZDgtNGYyZS1iNzE5LWMyMjQwYTg0MGQ5MCIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjIwODUxODM0MDV9.kTkRJY4r0nX01incBUR8zQA3vcQYRXhzOB1m55-Gm6a8afYS_L-R7H-cpXxJG-xLZRhQ222u0hGVnV5PySjF3g'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function testStudentQueries() {
  console.log('Testing student queries...\n')

  // Login as student
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'student@test.com',
    password: 'password123'
  })

  if (authError) {
    console.error('Login error:', authError)
    return
  }

  console.log('✅ Logged in as student:', authData.user.email)
  console.log('Student ID:', authData.user.id)

  // Test enrollment query
  console.log('\n--- Testing enrollment query ---')
  const { data: enrollment, error: enrollError } = await supabase
    .from('enrollments')
    .select('enrollment_id')
    .eq('user_id', authData.user.id)
    .eq('course_id', 2)
    .eq('status', 'active')
    .single()

  console.log('Enrollment:', enrollment)
  if (enrollError) console.error('Enrollment error:', enrollError)

  // Test course query (exact same as page)
  console.log('\n--- Testing course query ---')
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select(`
      course_id,
      title,
      description,
      thumbnail_url,
      author:profiles!courses_author_id_fkey (
        full_name,
        avatar_url
      )
    `)
    .eq('course_id', 2)
    .single()

  console.log('Course:', course)
  if (courseError) console.error('Course error:', courseError)

  // Test lessons query
  console.log('\n--- Testing lessons query ---')
  const { data: lessons, error: lessonsError } = await supabase
    .from('lessons')
    .select('id, title, sequence, description')
    .eq('course_id', 2)
    .eq('status', 'published')
    .order('sequence', { ascending: true })

  console.log('Lessons:', lessons)
  if (lessonsError) console.error('Lessons error:', lessonsError)
}

testStudentQueries()
