import { createClient } from '@/lib/supabase/server'
import { CreateSchoolFlow } from '@/components/tenant/create-school-flow'

export default async function CreateSchoolPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  // If JWT is invalid/expired, treat as unauthenticated
  const validUser = error ? null : user

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <CreateSchoolFlow
          user={validUser ? { id: validUser.id, email: validUser.email || '' } : null}
        />
      </div>
    </div>
  )
}
