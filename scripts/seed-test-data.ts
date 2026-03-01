#!/usr/bin/env tsx
/**
 * Seed script for creating test data
 * Creates teacher and student users with courses, lessons, and exams
 *
 * Run with: npx tsx scripts/seed-test-data.ts
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJFUzI1NiIsImtpZCI6ImI4MTI2OWYxLTIxZDgtNGYyZS1iNzE5LWMyMjQwYTg0MGQ5MCIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MjA4NTE3MzgxOX0.xfyISLQB3UoHYu1lTAzcmbXzNeclsdwy7YS1pHfl2i_lY7Nr2jzfzB6Gy3hZu-8cObx7Az3Je4py3RNto2LzMA'

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function seed() {
  console.log('🌱 Starting seed process...\n')

  try {
    // 1. Create test users
    console.log('👤 Creating test users...')

    // Create or get teacher
    let teacher
    const { data: existingTeacher, error: teacherError } = await supabase.auth.admin.createUser({
      email: 'teacher@test.com',
      password: 'password123',
      email_confirm: true,
      user_metadata: {
        full_name: 'Sarah Teacher'
      }
    })

    if (teacherError && teacherError.message.includes('already been registered')) {
      // User exists, fetch it
      const { data: users } = await supabase.auth.admin.listUsers()
      teacher = { user: users.users.find(u => u.email === 'teacher@test.com')! }
      console.log('✅ Using existing teacher:', teacher.user.email)
    } else if (teacherError) {
      throw teacherError
    } else {
      teacher = existingTeacher
      console.log('✅ Created teacher:', teacher.user.email)
    }

    // Update teacher profile
    await supabase
      .from('profiles')
      .update({ full_name: 'Sarah Teacher' })
      .eq('id', teacher.user.id)

    // Assign teacher role
    await supabase
      .from('user_roles')
      .insert({ user_id: teacher.user.id, role: 'teacher' })

    console.log('✅ Assigned teacher role')

    // Create or get student
    let student
    const { data: existingStudent, error: studentError } = await supabase.auth.admin.createUser({
      email: 'student@test.com',
      password: 'password123',
      email_confirm: true,
      user_metadata: {
        full_name: 'John Student'
      }
    })

    if (studentError && studentError.message.includes('already been registered')) {
      // User exists, fetch it
      const { data: users } = await supabase.auth.admin.listUsers()
      student = { user: users.users.find(u => u.email === 'student@test.com')! }
      console.log('✅ Using existing student:', student.user.email)
    } else if (studentError) {
      throw studentError
    } else {
      student = existingStudent
      console.log('✅ Created student:', student.user.email)
    }

    // Update student profile
    await supabase
      .from('profiles')
      .update({ full_name: 'John Student' })
      .eq('id', student.user.id)

    console.log('\n📂 Creating course categories...')

    // 2. Create categories first
    const { data: category, error: categoryError } = await supabase
      .from('course_categories')
      .insert({
        name: 'Programming',
        description: 'Learn to code in various programming languages'
      })
      .select()
      .single()

    if (categoryError) {
      console.error('Error creating category:', categoryError)
      // Category might already exist, try to fetch it
      const { data: existingCategory } = await supabase
        .from('course_categories')
        .select('id')
        .eq('name', 'Programming')
        .single()

      if (!existingCategory) throw categoryError
      console.log('✅ Using existing category')
    } else {
      console.log('✅ Created category:', category.name)
    }

    const categoryId = category?.id || 1

    console.log('\n📚 Creating course content...')

    // 3. Create a course by the teacher
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .insert({
        title: 'Introduction to Web Development',
        description: 'Learn the fundamentals of web development including HTML, CSS, and JavaScript',
        thumbnail_url: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800',
        author_id: teacher.user.id,
        status: 'published',
        category_id: categoryId
      })
      .select()
      .single()

    if (courseError) {
      console.error('Error creating course:', courseError)
      throw courseError
    }
    console.log('✅ Created course:', course.title)

    // 3. Create lessons for the course
    const lessons = [
      {
        course_id: course.course_id,
        title: 'Getting Started with HTML',
        description: 'Learn the basics of HTML markup',
        content: `# Getting Started with HTML

Welcome to your first lesson! In this lesson, you'll learn the fundamentals of HTML.

## What is HTML?

HTML (HyperText Markup Language) is the standard markup language for creating web pages.

## Basic HTML Structure

\`\`\`html
<!DOCTYPE html>
<html>
  <head>
    <title>My First Page</title>
  </head>
  <body>
    <h1>Hello World!</h1>
    <p>This is my first HTML page.</p>
  </body>
</html>
\`\`\`

## Key Concepts

- **Elements**: The building blocks of HTML
- **Tags**: Used to create elements
- **Attributes**: Provide additional information about elements

## Practice Exercise

Try creating your own HTML page with:
1. A title
2. A heading
3. A paragraph
4. A list of items

Good luck!`,
        video_url: 'https://www.youtube.com/watch?v=qz0aGYrrlhU',
        sequence: 1,
        status: 'published'
      },
      {
        course_id: course.course_id,
        title: 'CSS Fundamentals',
        description: 'Style your web pages with CSS',
        content: `# CSS Fundamentals

Now that you know HTML, let's make it look good with CSS!

## What is CSS?

CSS (Cascading Style Sheets) is used to style and layout web pages.

## Basic CSS Syntax

\`\`\`css
selector {
  property: value;
}
\`\`\`

## Common Properties

- \`color\`: Text color
- \`background-color\`: Background color
- \`font-size\`: Size of text
- \`margin\`: Space outside an element
- \`padding\`: Space inside an element

## Example

\`\`\`css
h1 {
  color: blue;
  font-size: 32px;
  text-align: center;
}

p {
  color: #333;
  line-height: 1.6;
}
\`\`\`

Try styling your HTML page!`,
        sequence: 2,
        status: 'published'
      },
      {
        course_id: course.course_id,
        title: 'JavaScript Basics',
        description: 'Add interactivity with JavaScript',
        content: `# JavaScript Basics

Let's make your web pages interactive!

## What is JavaScript?

JavaScript is a programming language that runs in the browser.

## Variables

\`\`\`javascript
let name = "John";
const age = 25;
var city = "New York";
\`\`\`

## Functions

\`\`\`javascript
function greet(name) {
  return "Hello, " + name + "!";
}

console.log(greet("World"));
\`\`\`

## DOM Manipulation

\`\`\`javascript
// Get an element
const button = document.querySelector('button');

// Add event listener
button.addEventListener('click', function() {
  alert('Button clicked!');
});
\`\`\`

Practice these concepts in your browser console!`,
        sequence: 3,
        status: 'published'
      }
    ]

    for (const lesson of lessons) {
      const { error } = await supabase.from('lessons').insert(lesson)
      if (error) {
        console.error('Error creating lesson:', error)
        throw error
      }
      console.log('✅ Created lesson:', lesson.title)
    }

    // 4. Create an exam for the course
    const { data: exam, error: examError } = await supabase
      .from('exams')
      .insert({
        course_id: course.course_id,
        title: 'HTML, CSS & JavaScript Quiz',
        description: 'Test your knowledge of web development fundamentals',
        duration: 30,
        sequence: 1,
        status: 'published',
        created_by: teacher.user.id,
        exam_date: new Date().toISOString()
      })
      .select()
      .single()

    if (examError) {
      console.error('Error creating exam:', examError)
      throw examError
    }
    console.log('✅ Created exam:', exam.title)

    // 5. Create exam questions
    const questions = [
      {
        exam_id: exam.exam_id,
        question_text: 'What does HTML stand for?',
        question_type: 'multiple_choice'
      },
      {
        exam_id: exam.exam_id,
        question_text: 'CSS is used to style web pages.',
        question_type: 'true_false'
      },
      {
        exam_id: exam.exam_id,
        question_text: 'Explain the difference between margin and padding in CSS.',
        question_type: 'free_text'
      }
    ]

    for (const question of questions) {
      const { data: q, error: qError } = await supabase
        .from('exam_questions')
        .insert(question)
        .select()
        .single()

      if (qError) {
        console.error('Error creating question:', qError)
        throw qError
      }

      // Add options for multiple choice
      if (question.question_type === 'multiple_choice') {
        const options = [
          { question_id: q.question_id, option_text: 'HyperText Markup Language', is_correct: true },
          { question_id: q.question_id, option_text: 'High Tech Modern Language', is_correct: false },
          { question_id: q.question_id, option_text: 'Home Tool Markup Language', is_correct: false },
          { question_id: q.question_id, option_text: 'Hyperlinks and Text Markup Language', is_correct: false }
        ]

        for (const option of options) {
          await supabase.from('question_options').insert(option)
        }
      }

      console.log('✅ Created question:', question.question_text.substring(0, 50) + '...')
    }

    // 6. Create product for the course
    const { data: product, error: productError } = await supabase
      .from('products')
      .insert({
        name: course.title,
        description: course.description,
        price: 49.99,
        currency: 'usd'
      })
      .select()
      .single()

    if (productError) {
      console.error('Error creating product:', productError)
      throw productError
    }
    console.log('✅ Created product:', product.name)

    // Link product to course
    await supabase
      .from('product_courses')
      .insert({
        product_id: product.product_id,
        course_id: course.course_id
      })

    // 7. Enroll student using the enroll_user function
    const { error: enrollError } = await supabase.rpc('enroll_user', {
      _user_id: student.user.id,
      _product_id: product.product_id
    })

    if (enrollError) {
      console.error('Error enrolling student:', enrollError)
      throw enrollError
    }
    console.log('✅ Enrolled student in course')

    // 8. Mark first lesson as completed by student
    const { data: firstLesson } = await supabase
      .from('lessons')
      .select('id')
      .eq('course_id', course.course_id)
      .eq('sequence', 1)
      .single()

    if (firstLesson) {
      await supabase
        .from('lesson_completions')
        .insert({
          user_id: student.user.id,
          lesson_id: firstLesson.id
        })
      console.log('✅ Marked first lesson as completed')
    }

    console.log('\n✨ Seed completed successfully!\n')
    console.log('📧 Test Accounts:')
    console.log('   Teacher: teacher@test.com / password123')
    console.log('   Student: student@test.com / password123\n')
    console.log('🎓 Test Course: Introduction to Web Development')
    console.log('   - 3 lessons (1 completed by student)')
    console.log('   - 1 exam with 3 questions\n')

  } catch (error) {
    console.error('❌ Seed failed:', error)
    process.exit(1)
  }
}

seed()
