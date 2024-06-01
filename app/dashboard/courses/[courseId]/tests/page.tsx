import { Sidebar } from '@/components/dashboard/Sidebar'
import { createClient } from '@/utils/supabase/server'
import { Database } from '@/utils/supabase/supabase'
import { cookies } from 'next/headers'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion'
import Link from 'next/link'

export default async function DashboardTests ({
  params
}: {
  params: { courseId: string }
}) {
  const cookieStore = cookies()
  const supabase = createClient(cookieStore)

  const user = await supabase.auth.getUser()
  const userProfile = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.data.user?.id)
    .single()

  const tests = await supabase
    .from('tests')
    .select(`
            *,
            test_localizations ( * )
        `
    )
    .eq('test_localizations.language_code', userProfile.data?.preferred_language || 'en')
    .eq('course_id', params.courseId)

  console.log(tests)

  return (
    <div className="flex-1 p-4 overflow-y-auto w-full flex flex-col gap-4">
      <h1 className="text-3xl font-semibold text-left tracking-tight">
        Tests
      </h1>
      <div className="flex flex-col gap-4">
        {tests.data?.map((test) => {
				  return (
  <Accordion type="single" collapsible>
    <AccordionItem value="item-1">
      <AccordionTrigger>
        {test.test_localizations[0].title}
      </AccordionTrigger>
      <AccordionContent>
        <Link
          className="text-blue-500 hover:underline"
          href={`/dashboard/courses/${params.courseId}/tests/${test.id}`}
        >
          Ver
        </Link>
      </AccordionContent>
    </AccordionItem>
  </Accordion>
				  )
        })}
      </div>
    </div>
  )
}
