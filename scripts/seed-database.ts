import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJFUzI1NiIsImtpZCI6ImI4MTI2OWYxLTIxZDgtNGYyZS1iNzE5LWMyMjQwYTg0MGQ5MCIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MjA4NTE4MzQwNX0.6S_JislZTa8t8apwlrkOtDM9BYSVXVJ_LGvLJwPuzFTbBXf4HrnsteXxNbIZF0KAX0iKXOPSkYXWJP4xTjwdPA'

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function seedDatabase() {
  console.log('🌱 Starting database seed...')

  try {
    // Create course categories first
    console.log('Creating course categories...')
    const { error: categoriesError } = await supabase
      .from('course_categories')
      .upsert([
        { id: 1, name: 'Programming', description: 'Learn to code in various programming languages' },
        { id: 2, name: 'Design', description: 'Master design principles and tools' },
        { id: 3, name: 'Business', description: 'Business and entrepreneurship courses' }
      ], { onConflict: 'id' })

    if (categoriesError) {
      console.error('Categories creation error:', categoriesError)
      throw categoriesError
    }

    console.log('✅ Categories created')

    // Get or create teacher user
    console.log('Getting or creating teacher user...')
    let teacher = await supabase.auth.admin.listUsers()
      .then(({ data }) => data?.users.find(u => u.email === 'teacher@test.com'))

    if (!teacher) {
      const { data, error } = await supabase.auth.admin.createUser({
        email: 'teacher@test.com',
        password: 'password123',
        email_confirm: true,
        user_metadata: {
          full_name: 'Test Teacher'
        }
      })
      if (error) throw error
      teacher = data.user
      console.log('✅ Teacher created:', teacher.email)
    } else {
      console.log('✅ Teacher already exists:', teacher.email)
    }

    // Get or create student user
    console.log('Getting or creating student user...')
    let student = await supabase.auth.admin.listUsers()
      .then(({ data }) => data?.users.find(u => u.email === 'student@test.com'))

    if (!student) {
      const { data, error } = await supabase.auth.admin.createUser({
        email: 'student@test.com',
        password: 'password123',
        email_confirm: true,
        user_metadata: {
          full_name: 'Test Student'
        }
      })
      if (error) throw error
      student = data.user
      console.log('✅ Student created:', student.email)
    } else {
      console.log('✅ Student already exists:', student.email)
    }

    // Get or create admin user
    console.log('Getting or creating admin user...')
    let admin = await supabase.auth.admin.listUsers()
      .then(({ data }) => data?.users.find(u => u.email === 'admin@test.com'))

    if (!admin) {
      const { data, error } = await supabase.auth.admin.createUser({
        email: 'admin@test.com',
        password: 'password123',
        email_confirm: true,
        user_metadata: {
          full_name: 'Test Admin'
        }
      })
      if (error) throw error
      admin = data.user
      console.log('✅ Admin created:', admin.email)
    } else {
      console.log('✅ Admin already exists:', admin.email)
    }

    // Assign roles
    console.log('Assigning roles...')
    await supabase.from('user_roles').upsert([
      { user_id: teacher.id, role: 'teacher' },
      { user_id: student.id, role: 'student' },
      { user_id: admin.id, role: 'admin' }
    ], { onConflict: 'user_id,role' })

    // Create course by teacher
    console.log('Creating course...')
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .insert({
        title: 'Introduction to JavaScript',
        description: 'Learn the fundamentals of JavaScript programming from scratch',
        thumbnail_url: 'https://images.unsplash.com/photo-1579468118864-1b9ea3c0db4a?w=800',
        author_id: teacher.id,
        category_id: 1,
        status: 'published',
        published_at: new Date().toISOString()
      })
      .select()
      .single()

    if (courseError) throw courseError
    console.log('✅ Course created:', course.title)

    // Create lessons
    console.log('Creating lessons...')
    const lessons = [
      {
        course_id: course.course_id,
        title: 'Getting Started with JavaScript',
        description: 'Learn about variables, data types, and basic syntax',
        sequence: 1,
        content: `# Getting Started with JavaScript

Welcome to your first JavaScript lesson!

## What is JavaScript?

JavaScript is a versatile programming language that runs in web browsers and on servers.

## Variables

In JavaScript, you can declare variables using \`let\`, \`const\`, or \`var\`:

\`\`\`javascript
let name = "Alice";
const age = 25;
var isStudent = true;
\`\`\`

## Data Types

JavaScript has several basic data types:
- String: \`"Hello World"\`
- Number: \`42\`
- Boolean: \`true\` or \`false\`
- Undefined: \`undefined\`
- Null: \`null\`

## Practice

Try creating your own variables in the console!`,
        video_url: 'https://www.youtube.com/watch?v=W6NZfCO5SIk',
        status: 'published'
      },
      {
        course_id: course.course_id,
        title: 'Functions and Control Flow',
        description: 'Learn about functions, if statements, and loops',
        sequence: 2,
        content: `# Functions and Control Flow

## Functions

Functions are reusable blocks of code:

\`\`\`javascript
function greet(name) {
  return "Hello, " + name + "!";
}

console.log(greet("Alice")); // "Hello, Alice!"
\`\`\`

## If Statements

Control the flow of your program:

\`\`\`javascript
if (age >= 18) {
  console.log("You are an adult");
} else {
  console.log("You are a minor");
}
\`\`\`

## Loops

Repeat actions multiple times:

\`\`\`javascript
for (let i = 0; i < 5; i++) {
  console.log(i);
}
\`\`\``,
        status: 'published'
      },
      {
        course_id: course.course_id,
        title: 'Working with Arrays',
        description: 'Master arrays and array methods',
        sequence: 3,
        content: `# Working with Arrays

## Creating Arrays

\`\`\`javascript
const fruits = ["apple", "banana", "orange"];
const numbers = [1, 2, 3, 4, 5];
\`\`\`

## Array Methods

### map()
Transform each element:
\`\`\`javascript
const doubled = numbers.map(n => n * 2);
// [2, 4, 6, 8, 10]
\`\`\`

### filter()
Keep only elements that pass a test:
\`\`\`javascript
const evens = numbers.filter(n => n % 2 === 0);
// [2, 4]
\`\`\`

### reduce()
Combine all elements:
\`\`\`javascript
const sum = numbers.reduce((acc, n) => acc + n, 0);
// 15
\`\`\``,
        status: 'published'
      }
    ]

    const { data: createdLessons, error: lessonsError } = await supabase
      .from('lessons')
      .insert(lessons)
      .select()

    if (lessonsError) throw lessonsError
    console.log(`✅ Created ${createdLessons.length} lessons`)

    // Create exam
    console.log('Creating exam...')
    const { data: exam, error: examError } = await supabase
      .from('exams')
      .insert({
        course_id: course.course_id,
        title: 'JavaScript Fundamentals Quiz',
        description: 'Test your knowledge of basic JavaScript concepts',
        duration: 30,
        sequence: 1,
        status: 'published',
        created_by: teacher.id,
        exam_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days from now
      })
      .select()
      .single()

    if (examError) throw examError
    console.log('✅ Exam created:', exam.title)

    // Create exam questions
    console.log('Creating exam questions...')
    const { data: question1 } = await supabase
      .from('exam_questions')
      .insert({
        exam_id: exam.exam_id,
        question_text: 'Which keyword is used to declare a constant variable in JavaScript?',
        question_type: 'multiple_choice'
      })
      .select()
      .single()

    await supabase.from('question_options').insert([
      { question_id: question1.question_id, option_text: 'var', is_correct: false },
      { question_id: question1.question_id, option_text: 'let', is_correct: false },
      { question_id: question1.question_id, option_text: 'const', is_correct: true },
      { question_id: question1.question_id, option_text: 'constant', is_correct: false }
    ])

    await supabase.from('exam_questions').insert([
      {
        exam_id: exam.exam_id,
        question_text: 'JavaScript is a statically typed language.',
        question_type: 'true_false'
      },
      {
        exam_id: exam.exam_id,
        question_text: 'Explain the difference between let and const in JavaScript.',
        question_type: 'free_text'
      }
    ])

    console.log('✅ Created exam questions')

    // Create product and enroll student
    console.log('Creating product...')
    const { data: product } = await supabase
      .from('products')
      .insert({
        name: 'JavaScript Course Access',
        price: 29.99,
        description: 'Full access to Introduction to JavaScript course',
        currency: 'usd'
      })
      .select()
      .single()

    await supabase.from('product_courses').insert({
      product_id: product.product_id,
      course_id: course.course_id
    })

    console.log('Enrolling student...')
    await supabase.from('enrollments').insert({
      user_id: student.id,
      course_id: course.course_id,
      product_id: product.product_id,
      status: 'active'
    })

    // Add lesson completion
    await supabase.from('lesson_completions').insert({
      user_id: student.id,
      lesson_id: createdLessons[0].id
    })

    console.log('✅ Student enrolled and first lesson completed')

    console.log('\n🎉 Database seeded successfully!')
    console.log('\n📧 Test Accounts:')
    console.log('  Admin:   admin@test.com / password123')
    console.log('  Teacher: teacher@test.com / password123')
    console.log('  Student: student@test.com / password123')
    console.log('\n🌐 Local Supabase:')
    console.log('  URL: http://127.0.0.1:54321')
    console.log('  Studio: http://127.0.0.1:54323')

  } catch (error) {
    console.error('❌ Seed failed:', error)
    process.exit(1)
  }
}

seedDatabase()
