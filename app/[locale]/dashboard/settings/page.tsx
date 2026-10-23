import { redirect } from 'next/navigation'
import { getUserRole } from '@/lib/supabase/get-user-role'

// Shared settings entry point for the sidebar/user-nav links. Admins configure
// the school; students and teachers manage their account on their profile page.
export default async function DashboardSettingsPage() {
  const role = await getUserRole()
  if (role === 'admin') redirect('/dashboard/admin/settings')
  if (role === 'student') redirect('/dashboard/student/profile')
  if (role === 'teacher') redirect('/dashboard/profile')
  redirect('/dashboard')
}
