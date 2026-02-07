'use client'

import { useState } from 'react'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  Edit,
  Save,
  Bot,
  User,
  AlertTriangle,
} from 'lucide-react'
import { format } from 'date-fns'

interface ExamSubmission {
  id: number
  student_id: string
  student_name: string
  submitted_at: string
  score: number
  review_status: 'pending' | 'ai_reviewed' | 'teacher_reviewed'
  requires_attention: boolean
  ai_model_used?: string
  ai_processing_time_ms?: number
}

interface QuestionScore {
  score_id: number
  question_id: number
  question_text: string
  student_answer: string
  points_earned: number
  points_possible: number
  is_correct: boolean
  ai_feedback: string
  ai_confidence: number
  is_overridden: boolean
  teacher_notes?: string
  teacher_id?: string
}

interface ExamSubmissionsReviewProps {
  examId: number
  examTitle: string
  submissions: ExamSubmission[]
  onReviewSubmission?: (submissionId: number) => void
}

export function ExamSubmissionsReview({
  examId,
  examTitle,
  submissions,
  onReviewSubmission,
}: ExamSubmissionsReviewProps) {
  const [selectedSubmission, setSelectedSubmission] = useState<ExamSubmission | null>(null)
  const [questionScores, setQuestionScores] = useState<QuestionScore[]>([])
  const [isLoadingScores, setIsLoadingScores] = useState(false)
  const [editingScore, setEditingScore] = useState<number | null>(null)
  const [newPoints, setNewPoints] = useState<number>(0)
  const [teacherNotes, setTeacherNotes] = useState<string>('')

  // Filter submissions by status
  const pendingSubmissions = submissions.filter((s) => s.review_status === 'pending')
  const aiReviewedSubmissions = submissions.filter((s) => s.review_status === 'ai_reviewed')
  const teacherReviewedSubmissions = submissions.filter((s) => s.review_status === 'teacher_reviewed')
  const needsAttention = submissions.filter((s) => s.requires_attention)

  const handleViewSubmission = async (submission: ExamSubmission) => {
    setSelectedSubmission(submission)
    setIsLoadingScores(true)

    // In real implementation, fetch from API
    // const response = await fetch(`/api/teacher/submissions/${submission.id}/scores`)
    // const data = await response.json()
    // setQuestionScores(data.scores)

    // Mock data for now
    setTimeout(() => {
      setQuestionScores([
        {
          score_id: 1,
          question_id: 1,
          question_text: 'Explain the concept of recursion in programming.',
          student_answer: 'Recursion is when a function calls itself to solve a problem...',
          points_earned: 8,
          points_possible: 10,
          is_correct: true,
          ai_feedback:
            'Excellent explanation! You correctly identified the key concept and provided a clear example.',
          ai_confidence: 0.92,
          is_overridden: false,
        },
        {
          score_id: 2,
          question_id: 2,
          question_text: 'What is the time complexity of binary search?',
          student_answer: 'O(n)',
          points_earned: 0,
          points_possible: 5,
          is_correct: false,
          ai_feedback:
            'Incorrect. Binary search has O(log n) time complexity, not O(n). This is because it divides the search space in half with each iteration.',
          ai_confidence: 0.98,
          is_overridden: false,
        },
      ])
      setIsLoadingScores(false)
    }, 500)
  }

  const handleEditScore = (scoreId: number, currentPoints: number, notes?: string) => {
    setEditingScore(scoreId)
    setNewPoints(currentPoints)
    setTeacherNotes(notes || '')
  }

  const handleSaveOverride = async (scoreId: number) => {
    // In real implementation, call API
    // await fetch(`/api/teacher/scores/${scoreId}/override`, {
    //   method: 'POST',
    //   body: JSON.stringify({ points: newPoints, notes: teacherNotes })
    // })

    // Update local state
    setQuestionScores((prev) =>
      prev.map((score) =>
        score.score_id === scoreId
          ? {
              ...score,
              points_earned: newPoints,
              teacher_notes: teacherNotes,
              is_overridden: true,
            }
          : score
      )
    )
    setEditingScore(null)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <Badge variant="secondary">
            <Clock className="mr-1 h-3 w-3" />
            Pending
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
          <Badge variant="secondary">
            <User className="mr-1 h-3 w-3" />
            Teacher Reviewed
          </Badge>
        )
    }
  }

  const getScoreBadge = (score: number, passingScore: number = 70) => {
    if (score >= passingScore) {
      return <Badge className="bg-green-500">Pass ({score}%)</Badge>
    } else if (score >= passingScore - 10) {
      return <Badge className="bg-yellow-500">Near Pass ({score}%)</Badge>
    } else {
      return <Badge variant="destructive">Fail ({score}%)</Badge>
    }
  }

  const SubmissionsTable = ({ submissions }: { submissions: ExamSubmission[] }) => (
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
        {submissions.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground">
              No submissions in this category
            </TableCell>
          </TableRow>
        ) : (
          submissions.map((submission) => (
            <TableRow key={submission.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  {submission.student_name}
                  {submission.requires_attention && (
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  )}
                </div>
              </TableCell>
              <TableCell>{getScoreBadge(submission.score)}</TableCell>
              <TableCell>{getStatusBadge(submission.review_status)}</TableCell>
              <TableCell>{format(new Date(submission.submitted_at), 'PPp')}</TableCell>
              <TableCell>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleViewSubmission(submission)}
                >
                  <Eye className="mr-2 h-4 w-4" />
                  Review
                </Button>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{examTitle} - Submissions</CardTitle>
          <CardDescription>
            Review and grade student exam submissions
          </CardDescription>
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
              <SubmissionsTable submissions={submissions} />
            </TabsContent>

            <TabsContent value="pending" className="mt-6">
              <SubmissionsTable submissions={pendingSubmissions} />
            </TabsContent>

            <TabsContent value="ai" className="mt-6">
              <SubmissionsTable submissions={aiReviewedSubmissions} />
            </TabsContent>

            <TabsContent value="teacher" className="mt-6">
              <SubmissionsTable submissions={teacherReviewedSubmissions} />
            </TabsContent>

            <TabsContent value="attention" className="mt-6">
              <Alert className="mb-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  These submissions have been flagged for review due to low AI confidence scores,
                  potential edge cases, or other issues.
                </AlertDescription>
              </Alert>
              <SubmissionsTable submissions={needsAttention} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Submission Detail Dialog */}
      <Dialog open={!!selectedSubmission} onOpenChange={() => setSelectedSubmission(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Submission Review - {selectedSubmission?.student_name}
            </DialogTitle>
            <DialogDescription>
              {selectedSubmission && (
                <div className="flex items-center gap-4 mt-2">
                  <span>Score: {selectedSubmission.score}%</span>
                  {getStatusBadge(selectedSubmission.review_status)}
                  {selectedSubmission.ai_model_used && (
                    <span className="text-xs text-muted-foreground">
                      Graded by {selectedSubmission.ai_model_used}
                    </span>
                  )}
                </div>
              )}
            </DialogDescription>
          </DialogHeader>

          {isLoadingScores ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
                <p className="text-muted-foreground">Loading submission details...</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6 mt-6">
              {questionScores.map((score, index) => (
                <Card key={score.score_id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-base">
                          Question {index + 1}
                          {score.is_correct ? (
                            <CheckCircle2 className="inline ml-2 h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="inline ml-2 h-4 w-4 text-red-500" />
                          )}
                        </CardTitle>
                        <CardDescription className="mt-2">{score.question_text}</CardDescription>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-lg">
                          {score.points_earned}/{score.points_possible}
                        </div>
                        {score.is_overridden && (
                          <Badge variant="outline" className="mt-1">
                            <User className="mr-1 h-3 w-3" />
                            Overridden
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Student Answer */}
                    <div>
                      <Label className="text-sm font-medium">Student Answer:</Label>
                      <div className="mt-1 p-3 bg-muted rounded-md">
                        <p className="text-sm">{score.student_answer}</p>
                      </div>
                    </div>

                    {/* AI Feedback */}
                    <div>
                      <Label className="text-sm font-medium flex items-center gap-2">
                        <Bot className="h-4 w-4" />
                        AI Feedback
                        <Badge variant="secondary" className="text-xs">
                          Confidence: {(score.ai_confidence * 100).toFixed(0)}%
                        </Badge>
                      </Label>
                      <div className="mt-1 p-3 bg-blue-50 dark:bg-blue-950 rounded-md border border-blue-200 dark:border-blue-800">
                        <p className="text-sm">{score.ai_feedback}</p>
                      </div>
                    </div>

                    {/* Teacher Override */}
                    {editingScore === score.score_id ? (
                      <div className="space-y-3 p-4 bg-muted rounded-lg">
                        <div className="flex items-center gap-4">
                          <div className="flex-1">
                            <Label htmlFor={`points-${score.score_id}`}>Points Earned</Label>
                            <Input
                              id={`points-${score.score_id}`}
                              type="number"
                              min="0"
                              max={score.points_possible}
                              step="0.5"
                              value={newPoints}
                              onChange={(e) => setNewPoints(parseFloat(e.target.value))}
                            />
                          </div>
                          <div className="text-muted-foreground pt-6">
                            / {score.points_possible}
                          </div>
                        </div>
                        <div>
                          <Label htmlFor={`notes-${score.score_id}`}>Teacher Notes</Label>
                          <Textarea
                            id={`notes-${score.score_id}`}
                            value={teacherNotes}
                            onChange={(e) => setTeacherNotes(e.target.value)}
                            placeholder="Add notes explaining your grading decision..."
                            rows={3}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleSaveOverride(score.score_id)}>
                            <Save className="mr-2 h-4 w-4" />
                            Save Override
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingScore(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {score.teacher_notes && (
                          <div>
                            <Label className="text-sm font-medium flex items-center gap-2">
                              <User className="h-4 w-4" />
                              Teacher Notes
                            </Label>
                            <div className="mt-1 p-3 bg-purple-50 dark:bg-purple-950 rounded-md border border-purple-200 dark:border-purple-800">
                              <p className="text-sm">{score.teacher_notes}</p>
                            </div>
                          </div>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            handleEditScore(score.score_id, score.points_earned, score.teacher_notes)
                          }
                        >
                          <Edit className="mr-2 h-4 w-4" />
                          Override Score
                        </Button>
                      </>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
