import { redirect } from 'next/navigation'

// This page will be handled by middleware to redirect to the appropriate role-based dashboard
export default function DashboardRoot() {
  // Middleware will redirect before this is reached, but as a fallback:
  redirect('/auth/login')
}
