import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function TeacherDashboard() {
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
        <h1 className="text-4xl font-bold mb-8">Teacher Dashboard</h1>

        <div className="bg-card border border-border rounded-lg p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4">Welcome, {user.email}!</h2>
          <p className="text-muted-foreground mb-4">
            This is your teacher dashboard. Here you can:
          </p>
          <ul className="list-disc list-inside space-y-2 text-muted-foreground">
            <li>Create and manage courses</li>
            <li>Write lessons with MDX editor</li>
            <li>Build exams with AI grading</li>
            <li>Review student submissions</li>
            <li>Track student progress</li>
          </ul>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-card border border-border rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-2">My Courses</h3>
            <p className="text-3xl font-bold text-primary">0</p>
            <p className="text-sm text-muted-foreground mt-2">Create your first course</p>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-2">Total Students</h3>
            <p className="text-3xl font-bold text-primary">0</p>
            <p className="text-sm text-muted-foreground mt-2">No enrollments yet</p>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-2">Pending Reviews</h3>
            <p className="text-3xl font-bold text-primary">0</p>
            <p className="text-sm text-muted-foreground mt-2">All caught up!</p>
          </div>
        </div>

        <div className="mt-8 bg-muted/50 border border-border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-2">🚧 Under Construction</h3>
          <p className="text-muted-foreground">
            The teacher dashboard is being built for maximum simplicity. Coming soon:
          </p>
          <ul className="list-disc list-inside space-y-1 mt-2 text-sm text-muted-foreground">
            <li>Simple 3-step course creation wizard</li>
            <li>MDX lesson editor with live preview</li>
            <li>Drag-and-drop lesson ordering</li>
            <li>Exam builder with multiple question types</li>
            <li>AI-assisted submission reviews</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
