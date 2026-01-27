import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function StudentDashboard() {
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
        <h1 className="text-4xl font-bold mb-8">Student Dashboard</h1>

        <div className="bg-card border border-border rounded-lg p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4">Welcome, {user.email}!</h2>
          <p className="text-muted-foreground mb-4">
            This is your student dashboard. Here you'll find:
          </p>
          <ul className="list-disc list-inside space-y-2 text-muted-foreground">
            <li>Your enrolled courses</li>
            <li>Lesson progress</li>
            <li>Upcoming exams</li>
            <li>Exercise completions</li>
            <li>AI-powered learning assistance</li>
          </ul>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-card border border-border rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-2">My Courses</h3>
            <p className="text-3xl font-bold text-primary">0</p>
            <p className="text-sm text-muted-foreground mt-2">No courses yet</p>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-2">Completed Lessons</h3>
            <p className="text-3xl font-bold text-primary">0</p>
            <p className="text-sm text-muted-foreground mt-2">Start learning!</p>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-2">Pending Exams</h3>
            <p className="text-3xl font-bold text-primary">0</p>
            <p className="text-sm text-muted-foreground mt-2">All caught up!</p>
          </div>
        </div>

        <div className="mt-8 bg-muted/50 border border-border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-2">🚧 Under Construction</h3>
          <p className="text-muted-foreground">
            The student dashboard is being built with exceptional UX in mind. Coming soon:
          </p>
          <ul className="list-disc list-inside space-y-1 mt-2 text-sm text-muted-foreground">
            <li>Course cards with visual progress</li>
            <li>Interactive lesson viewer with AI chat</li>
            <li>Exam interface with instant AI feedback</li>
            <li>Exercise completion tracking</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
