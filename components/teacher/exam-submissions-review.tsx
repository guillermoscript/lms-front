'use client'

import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  CheckCircle2,
  Clock,
  Eye,
  Bot,
  User,
  AlertTriangle,
  Hourglass,
} from 'lucide-react'
import { format } from 'date-fns'

interface ExamSubmission {
  id: number
  student_id: string
  student_name: string
  submitted_at: string
  score: number
  review_status: 'pending' | 'pending_teacher_review' | 'ai_reviewed' | 'teacher_reviewed'
  requires_attention: boolean
  ai_model_used?: string
  ai_processing_time_ms?: number
}

interface ExamSubmissionsReviewProps {
  examId: number
  examTitle: string
  courseId: number
  submissions: ExamSubmission[]
}

export function ExamSubmissionsReview({
  examId,
  examTitle,
  courseId,
  submissions,
}: ExamSubmissionsReviewProps) {
  const pendingSubmissions = submissions.filter(
    (s) => s.review_status === 'pending' || s.review_status === 'pending_teacher_review'
  )
  const aiReviewedSubmissions = submissions.filter((s) => s.review_status === 'ai_reviewed')
  const teacherReviewedSubmissions = submissions.filter((s) => s.review_status === 'teacher_reviewed')
  const needsAttention = submissions.filter((s) => s.requires_attention)

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <Badge variant="secondary">
            <Clock className="mr-1 h-3 w-3" />
            Pending
          </Badge>
        )
      case 'pending_teacher_review':
        return (
          <Badge className="bg-amber-500 text-white">
            <Hourglass className="mr-1 h-3 w-3" />
            Awaiting Review
          </Badge>
        )
      case 'ai_reviewed':
        return (
          <Badge variant="default">
            <Bot className="mr-1 h-3 w-3" />
            AI Reviewed
          </Badge>
        )
      case 'teacher_reviewed':
        return (
          <Badge className="bg-green-600 text-white">
            <User className="mr-1 h-3 w-3" />
            Teacher Reviewed
          </Badge>
        )
      default:
        return (
          <Badge variant="secondary">
            <Clock className="mr-1 h-3 w-3" />
            {status}
          </Badge>
        )
    }
  }

  const getScoreBadge = (score: number, reviewStatus: string) => {
    if (reviewStatus === 'pending' || reviewStatus === 'pending_teacher_review') {
      return <Badge variant="outline" className="text-muted-foreground">Pending</Badge>
    }
    if (score >= 70) {
      return <Badge className="bg-green-500">Pass ({Math.round(score)}%)</Badge>
    } else if (score >= 60) {
      return <Badge className="bg-yellow-500">Near Pass ({Math.round(score)}%)</Badge>
    } else {
      return <Badge variant="destructive">Fail ({Math.round(score)}%)</Badge>
    }
  }

  const SubmissionsTable = ({ items }: { items: ExamSubmission[] }) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Student</TableHead>
          <TableHead>Score</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Submitted</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
              No submissions in this category
            </TableCell>
          </TableRow>
        ) : (
          items.map((submission) => (
            <TableRow key={submission.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{submission.student_name}</span>
                  {submission.requires_attention && (
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  )}
                </div>
              </TableCell>
              <TableCell>{getScoreBadge(submission.score, submission.review_status)}</TableCell>
              <TableCell>{getStatusBadge(submission.review_status)}</TableCell>
              <TableCell>
                {submission.submitted_at
                  ? format(new Date(submission.submitted_at), 'PPp')
                  : '—'}
              </TableCell>
              <TableCell>
                <Link
                  href={`/dashboard/teacher/courses/${courseId}/exams/${examId}/submissions/${submission.id}`}
                >
                  <Button variant="outline" size="sm">
                    <Eye className="mr-2 h-4 w-4" />
                    Review
                  </Button>
                </Link>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{examTitle} - Submissions</CardTitle>
            <CardDescription>
              Review and grade student exam submissions ({submissions.length} total)
            </CardDescription>
          </div>
          {needsAttention.length > 0 && (
            <Badge variant="destructive" className="text-sm px-3 py-1">
              <AlertTriangle className="mr-1 h-4 w-4" />
              {needsAttention.length} need attention
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="all">
              All
              <Badge variant="secondary" className="ml-2">
                {submissions.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="pending">
              Pending
              <Badge variant="secondary" className="ml-2">
                {pendingSubmissions.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="ai">
              AI Reviewed
              <Badge variant="secondary" className="ml-2">
                {aiReviewedSubmissions.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="teacher">
              Teacher Reviewed
              <Badge variant="secondary" className="ml-2">
                {teacherReviewedSubmissions.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="attention">
              Needs Attention
              <Badge variant="destructive" className="ml-2">
                {needsAttention.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-6">
            <SubmissionsTable items={submissions} />
          </TabsContent>

          <TabsContent value="pending" className="mt-6">
            <SubmissionsTable items={pendingSubmissions} />
          </TabsContent>

          <TabsContent value="ai" className="mt-6">
            <SubmissionsTable items={aiReviewedSubmissions} />
          </TabsContent>

          <TabsContent value="teacher" className="mt-6">
            <SubmissionsTable items={teacherReviewedSubmissions} />
          </TabsContent>

          <TabsContent value="attention" className="mt-6">
            <Alert className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                These submissions have been flagged for review due to low AI confidence scores
                or pending teacher evaluation for free-text questions.
              </AlertDescription>
            </Alert>
            <SubmissionsTable items={needsAttention} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
