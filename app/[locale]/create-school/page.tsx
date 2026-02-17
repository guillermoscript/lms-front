import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CreateSchoolForm } from '@/components/tenant/create-school-form'

export default async function CreateSchoolPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login?redirectTo=/create-school')
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">Create Your School</h1>
          <p className="text-zinc-400 mt-2">
            Set up your own learning platform in seconds
          </p>
        </div>
        <CreateSchoolForm userId={user.id} />
      </div>
    </div>
  )
}
