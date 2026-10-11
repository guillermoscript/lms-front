import { UpdatePasswordForm } from '@/components/update-password-form'
import { createClient } from '@/lib/supabase/server'

export default async function Page({ searchParams }: {
  searchParams: Promise<{ error?: string }>
}) {
  const query = await searchParams
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  const hasSession = Boolean(user && !error && query.error !== 'invalid_link')
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <UpdatePasswordForm hasSession={hasSession} />
      </div>
    </div>
  )
}
