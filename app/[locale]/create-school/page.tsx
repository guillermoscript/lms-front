import { CreateSchoolFlow } from '@/components/tenant/create-school-flow'
import { getSessionUser } from '@/lib/supabase/tenant'

export default async function CreateSchoolPage() {
  const user = await getSessionUser()

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <CreateSchoolFlow
          user={user ? { id: user.id, email: user.email || '' } : null}
        />
      </div>
    </div>
  )
}
