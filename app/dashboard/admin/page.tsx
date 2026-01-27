import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function AdminDashboard() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">Admin Dashboard</h1>

        <div className="bg-card border border-border rounded-lg p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4">Welcome, Administrator!</h2>
          <p className="text-muted-foreground mb-4">
            This is your admin dashboard. Here you can:
          </p>
          <ul className="list-disc list-inside space-y-2 text-muted-foreground">
            <li>Manage all courses and content</li>
            <li>Oversee user accounts and permissions</li>
            <li>Monitor transactions and payments</li>
            <li>Approve/reject course publications</li>
            <li>View system analytics</li>
          </ul>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-card border border-border rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-2">Total Users</h3>
            <p className="text-3xl font-bold text-primary">0</p>
            <p className="text-sm text-muted-foreground mt-2">Registered users</p>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-2">Total Courses</h3>
            <p className="text-3xl font-bold text-primary">0</p>
            <p className="text-sm text-muted-foreground mt-2">Published courses</p>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-2">Enrollments</h3>
            <p className="text-3xl font-bold text-primary">0</p>
            <p className="text-sm text-muted-foreground mt-2">Active enrollments</p>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-2">Revenue</h3>
            <p className="text-3xl font-bold text-primary">$0</p>
            <p className="text-sm text-muted-foreground mt-2">Total revenue</p>
          </div>
        </div>

        <div className="mt-8 bg-muted/50 border border-border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-2">🚧 Under Construction</h3>
          <p className="text-muted-foreground">
            The admin dashboard is being built for comprehensive oversight. Coming soon:
          </p>
          <ul className="list-disc list-inside space-y-1 mt-2 text-sm text-muted-foreground">
            <li>User management interface</li>
            <li>Course approval workflow</li>
            <li>Transaction monitoring and reports</li>
            <li>System analytics and insights</li>
            <li>Role assignment tools</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
