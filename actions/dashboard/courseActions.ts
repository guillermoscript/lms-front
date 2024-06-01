'use server'

import { createResponse } from '@/utils/functions'
import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createCourseAction (prevDate: any, data: FormData) {
  console.log(data)
  if (!data.get('title') || !data.get('description')) {
    return createResponse('error', 'Please fill in all fields', null, null)
  }
  const supabase = createClient()
  const title = data.get('title') as string
  const description = data.get('description') as string
  const status = data.get('status') as string
  // get user id from session
  const userData = await supabase.auth.getUser()
  if (!userData || userData.error) {
    return createResponse('error', 'User not found', null, null)
  }

  const author_id = userData.data.user.id

  // get current user role
  const roleData = await supabase.from('user_roles').select('*').eq('profile_id', author_id).single()

  console.log(roleData)

  const courseData = await supabase.from('courses').insert([{
    title,
    description,
    status: 'draft',
    author_id,
    created_at: new Date() as string,
    updated_at: new Date()
  }])

  if (courseData.error) {
    console.log(courseData.error)
    return createResponse('error', 'Error creating course', null, courseData.error.message)
  }

  console.log(courseData.data)

  revalidatePath('/dashboard/teacher/courses', 'layout')
  return createResponse('success', 'Course created successfully', null, null)
}
