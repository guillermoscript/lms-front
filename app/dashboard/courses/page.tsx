import { Sidebar } from '@/components/dashboard/Sidebar'
import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion'
import Link from 'next/link'

export default async function Dashboard () {
  const cookieStore = cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user }
  } = await supabase.auth.getUser()

  const course = await supabase
    .from('course_enrollments')
    .select(
			`*,
    courses ( * )
  `
    )
    .eq('user_id', user?.id)

  console.log(course)

  return (
    <>
      <main className="flex-1 p-8 overflow-y-auto w-full">
        <h1 className="text-3xl pb-5 font-semibold text-left tracking-tight">
          Mis cursos
        </h1>

        {course.data?.map((course) => {
				  return (
  <Accordion type="single" collapsible>
    <AccordionItem value="item-1">
      <AccordionTrigger>
        {course.courses.title}
      </AccordionTrigger>
      <AccordionContent>
        <div className="flex flex-col gap-4">
          <p>{course.courses.description}</p>
          <Link
            className="text-blue-500 hover:underline"
            href={`/dashboard/courses/${course.courses.id}`}
          >
            Ver
          </Link>
        </div>
      </AccordionContent>
    </AccordionItem>
  </Accordion>
				  )
        })}
      </main>
    </>
  )
}
