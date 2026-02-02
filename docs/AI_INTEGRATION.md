# AI Integration Guide

**Status**: 📋 Documentation Complete (Implementation Pending)
**AI Provider**: Google Gemini 2.0 Flash (Recommended)
**Alternative**: OpenAI GPT-4o

---

## Overview

This LMS platform uses AI to enhance learning experiences in three key areas:

1. **Exercise Chat** - Help students understand exercises and debug code
2. **Exam Auto-Grading** - Evaluate exam submissions and provide feedback
3. **Course Q&A** - Answer student questions about course content

All AI features use streaming responses for better UX and are integrated with existing database tables via RLS-protected queries.

---

## Architecture Pattern

### Standard AI Integration Flow

```
1. User triggers AI action (submit exam, ask question)
   ↓
2. Client component sends request to API route
   ↓
3. API route validates user/permissions
   ↓
4. API route fetches context from Supabase (RLS-protected)
   ↓
5. API route calls AI model with context + prompt
   ↓
6. AI streams response back to client
   ↓
7. On completion, save results to database
```

### Key Principles

- **Server-Side AI Calls**: Never expose API keys to client
- **RLS Protection**: Use server-side Supabase client with service role only for admin operations
- **Streaming Responses**: Use ReadableStream for real-time feedback
- **Context Injection**: Include relevant course/lesson/exercise data in prompts
- **Error Handling**: Graceful fallbacks if AI fails
- **Cost Monitoring**: Log token usage and implement rate limits

---

## 1. Exercise Chat Assistant

### Purpose
Help students understand exercises, debug code, and learn concepts without giving direct answers.

### User Flow

```
Student viewing exercise → Clicks "Get Help" →
Opens chat interface → Types question →
AI provides hints/explanations →
Student tries again → Repeats until solved
```

### Database Tables

**Existing Tables** (already in schema):
- `exercises` - Exercise content and instructions
- `exercise_messages` - Chat message history

**Schema**:
```sql
-- exercises table
CREATE TABLE exercises (
  exercise_id SERIAL PRIMARY KEY,
  lesson_id INTEGER REFERENCES lessons(id),
  title TEXT NOT NULL,
  description TEXT,
  instructions TEXT,
  starter_code TEXT,
  solution_code TEXT,
  difficulty TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- exercise_messages table
CREATE TABLE exercise_messages (
  message_id SERIAL PRIMARY KEY,
  exercise_id INTEGER REFERENCES exercises(exercise_id),
  user_id UUID REFERENCES auth.users(id),
  content TEXT NOT NULL,
  role TEXT NOT NULL, -- 'user' or 'assistant'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### API Route Implementation

**File**: `app/api/chat/exercise/route.ts`

```typescript
import { createClient } from '@/lib/supabase/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextRequest, NextResponse } from 'next/server'

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!)
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

export async function POST(request: NextRequest) {
  try {
    const { exerciseId, message, userId } = await request.json()

    // Validate inputs
    if (!exerciseId || !message || !userId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Get authenticated user
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user || user.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get exercise context (RLS allows students to view exercises in enrolled courses)
    const { data: exercise, error: exerciseError } = await supabase
      .from('exercises')
      .select(`
        *,
        lesson:lessons(
          title,
          content,
          course:courses(title, description)
        )
      `)
      .eq('exercise_id', exerciseId)
      .single()

    if (exerciseError || !exercise) {
      return NextResponse.json({ error: 'Exercise not found' }, { status: 404 })
    }

    // Get previous chat history
    const { data: chatHistory } = await supabase
      .from('exercise_messages')
      .select('role, content')
      .eq('exercise_id', exerciseId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true })

    // Build AI prompt with context
    const systemPrompt = `You are a helpful programming tutor for an online learning platform.

**Your Role:**
- Help students understand programming concepts
- Provide hints and guidance, not direct answers
- Debug code and explain errors
- Encourage problem-solving

**Guidelines:**
- Never provide the complete solution code
- Ask leading questions to guide thinking
- Explain concepts clearly with examples
- Be encouraging and patient
- If student is stuck, give progressively stronger hints

**Current Exercise Context:**
Course: ${exercise.lesson.course.title}
Lesson: ${exercise.lesson.title}
Exercise: ${exercise.title}
Description: ${exercise.description}
Instructions: ${exercise.instructions}

${exercise.starter_code ? `Starter Code:\n\`\`\`\n${exercise.starter_code}\n\`\`\`` : ''}
`

    // Build chat messages
    const messages = [
      { role: 'user', parts: [{ text: systemPrompt }] },
      ...(chatHistory || []).map((msg) => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      })),
      { role: 'user', parts: [{ text: message }] },
    ]

    // Save user message to database
    await supabase.from('exercise_messages').insert({
      exercise_id: exerciseId,
      user_id: userId,
      content: message,
      role: 'user',
    })

    // Generate AI response (streaming)
    const chat = model.startChat({ history: messages.slice(0, -1) })
    const result = await chat.sendMessageStream(message)

    // Create readable stream
    const encoder = new TextEncoder()
    let fullResponse = ''

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.stream) {
            const text = chunk.text()
            fullResponse += text
            controller.enqueue(encoder.encode(text))
          }

          // Save assistant response to database
          await supabase.from('exercise_messages').insert({
            exercise_id: exerciseId,
            user_id: userId,
            content: fullResponse,
            role: 'assistant',
          })

          controller.close()
        } catch (error) {
          console.error('Stream error:', error)
          controller.error(error)
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    })
  } catch (error) {
    console.error('Exercise chat error:', error)
    return NextResponse.json(
      { error: 'Failed to generate response' },
      { status: 500 }
    )
  }
}
```

### Client Component

**File**: `components/student/exercise-chat.tsx`

```typescript
'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { IconSend, IconSparkles } from '@tabler/icons-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ExerciseChatProps {
  exerciseId: number
  userId: string
}

export function ExerciseChat({ exerciseId, userId }: ExerciseChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load chat history on mount
  useEffect(() => {
    loadChatHistory()
  }, [exerciseId])

  async function loadChatHistory() {
    const response = await fetch(`/api/chat/exercise/history?exerciseId=${exerciseId}`)
    if (response.ok) {
      const data = await response.json()
      setMessages(data.messages || [])
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage = input.trim()
    setInput('')
    setIsLoading(true)

    // Add user message to UI
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }])

    try {
      // Send to API
      const response = await fetch('/api/chat/exercise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exerciseId,
          userId,
          message: userMessage,
        }),
      })

      if (!response.ok) throw new Error('Failed to get response')

      // Stream response
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let assistantMessage = ''

      while (reader) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value)
        assistantMessage += text

        // Update UI with streaming text
        setMessages((prev) => {
          const lastMessage = prev[prev.length - 1]
          if (lastMessage?.role === 'assistant') {
            return [...prev.slice(0, -1), { role: 'assistant', content: assistantMessage }]
          }
          return [...prev, { role: 'assistant', content: assistantMessage }]
        })
      }
    } catch (error) {
      console.error('Chat error:', error)
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconSparkles className="h-5 w-5 text-primary" />
          AI Exercise Assistant
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Messages */}
          <div className="h-96 overflow-y-auto space-y-4 p-4 border rounded-lg">
            {messages.length === 0 && (
              <p className="text-muted-foreground text-center">
                Ask me anything about this exercise! I'm here to help.
              </p>
            )}

            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>AI</AvatarFallback>
                  </Avatar>
                )}
                <div
                  className={`rounded-lg px-4 py-2 max-w-[80%] ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
                {msg.role === 'user' && (
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>You</AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question about this exercise..."
              className="resize-none"
              rows={2}
              disabled={isLoading}
            />
            <Button type="submit" disabled={isLoading || !input.trim()}>
              <IconSend className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  )
}
```

---

## 2. Exam Auto-Grading

### Purpose
Automatically evaluate student exam submissions and provide detailed feedback for each question.

### User Flow

```
Student completes exam → Clicks "Submit" →
Shows loading state → AI evaluates answers →
Saves score + feedback to database →
Redirects to results page with AI feedback
```

### Database Tables

**Existing Tables**:
- `exams` - Exam metadata
- `exam_questions` - Individual questions
- `question_options` - Multiple choice options
- `exam_submissions` - Student submissions with AI feedback

**Key Schema**:
```sql
CREATE TABLE exam_submissions (
  submission_id SERIAL PRIMARY KEY,
  exam_id INTEGER REFERENCES exams(exam_id),
  student_id UUID REFERENCES auth.users(id),
  answers JSONB NOT NULL, -- { "question_id": "answer" }
  score NUMERIC,
  ai_data JSONB, -- AI feedback per question
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  graded_at TIMESTAMPTZ
);
```

**Existing Database Function** (already implemented):
```sql
CREATE FUNCTION save_exam_feedback(
  submission_id INTEGER,
  exam_id INTEGER,
  student_id UUID,
  answers JSONB,
  overall_feedback TEXT,
  score NUMERIC
) RETURNS VOID AS $$
BEGIN
  UPDATE exam_submissions
  SET
    ai_data = jsonb_build_object(
      'overall_feedback', overall_feedback,
      'graded_at', NOW()
    ),
    score = score,
    graded_at = NOW()
  WHERE submission_id = submission_id;
END;
$$ LANGUAGE plpgsql;
```

### API Route Implementation

**File**: `app/api/exams/submit/route.ts`

```typescript
import { createClient } from '@/lib/supabase/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextRequest, NextResponse } from 'next/server'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!)
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

export async function POST(request: NextRequest) {
  try {
    const { examId, answers } = await request.json()

    // Get authenticated user
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get exam with questions
    const { data: exam, error: examError } = await supabase
      .from('exams')
      .select(`
        *,
        questions:exam_questions(
          question_id,
          question_text,
          question_type,
          correct_answer,
          points,
          options:question_options(option_id, option_text, is_correct)
        )
      `)
      .eq('exam_id', examId)
      .single()

    if (examError || !exam) {
      return NextResponse.json({ error: 'Exam not found' }, { status: 404 })
    }

    // Create submission first (to get submission_id)
    const { data: submission, error: submissionError } = await supabase
      .from('exam_submissions')
      .insert({
        exam_id: examId,
        student_id: user.id,
        answers: answers,
      })
      .select('submission_id')
      .single()

    if (submissionError || !submission) {
      return NextResponse.json({ error: 'Failed to create submission' }, { status: 500 })
    }

    // Build AI grading prompt
    const gradingPrompt = `You are an expert educator grading a student's exam submission.

**Exam Title:** ${exam.title}
**Total Questions:** ${exam.questions.length}

**Your Task:**
1. Evaluate each answer carefully
2. For multiple choice: Check if correct option was selected
3. For true/false: Check if correct
4. For free text: Evaluate based on accuracy and completeness
5. Provide constructive feedback for each question
6. Calculate total score as percentage

**Output Format (JSON):**
{
  "questions": [
    {
      "question_id": 1,
      "student_answer": "...",
      "is_correct": true/false,
      "points_earned": 5,
      "feedback": "Excellent! Your answer demonstrates..."
    }
  ],
  "total_score": 85,
  "overall_feedback": "Great work overall! You showed strong understanding..."
}

**Questions and Student Answers:**

${exam.questions
  .map((q, idx) => {
    const studentAnswer = answers[q.question_id]
    return `
**Question ${idx + 1}** (${q.points} points)
Type: ${q.question_type}
Question: ${q.question_text}

${
  q.question_type === 'multiple_choice'
    ? `Options:\n${q.options.map((opt) => `- ${opt.option_text} ${opt.is_correct ? '(CORRECT)' : ''}`).join('\n')}`
    : q.question_type === 'true_false'
      ? `Correct Answer: ${q.correct_answer}`
      : `Expected concepts: ${q.correct_answer || 'Use your judgment'}`
}

Student Answer: ${studentAnswer || '(No answer provided)'}
`
  })
  .join('\n---\n')}

Return ONLY valid JSON, no additional text.`

    // Call AI for grading
    const result = await model.generateContent(gradingPrompt)
    const responseText = result.response.text()

    // Parse AI response
    let gradingData
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) || responseText.match(/\{[\s\S]*\}/)
      const jsonText = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : responseText
      gradingData = JSON.parse(jsonText)
    } catch (parseError) {
      console.error('Failed to parse AI response:', responseText)
      return NextResponse.json({ error: 'AI grading failed' }, { status: 500 })
    }

    // Save feedback using database function
    const { error: feedbackError } = await supabase.rpc('save_exam_feedback', {
      submission_id: submission.submission_id,
      exam_id: examId,
      student_id: user.id,
      answers: answers,
      overall_feedback: gradingData.overall_feedback,
      score: gradingData.total_score,
    })

    if (feedbackError) {
      console.error('Failed to save feedback:', feedbackError)
      return NextResponse.json({ error: 'Failed to save feedback' }, { status: 500 })
    }

    // Also save per-question feedback in ai_data
    await supabase
      .from('exam_submissions')
      .update({
        ai_data: {
          overall_feedback: gradingData.overall_feedback,
          question_feedback: gradingData.questions,
          graded_at: new Date().toISOString(),
        },
      })
      .eq('submission_id', submission.submission_id)

    return NextResponse.json({
      success: true,
      submissionId: submission.submission_id,
      score: gradingData.total_score,
    })
  } catch (error) {
    console.error('Exam submission error:', error)
    return NextResponse.json({ error: 'Failed to submit exam' }, { status: 500 })
  }
}
```

### Client Integration

**File**: `app/dashboard/student/courses/[courseId]/exams/[examId]/page.tsx`

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

export default function TakeExamPage({ exam, userId }: { exam: any; userId: string }) {
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()

  async function handleSubmit() {
    // Confirm submission
    if (!confirm('Are you sure you want to submit your exam? This cannot be undone.')) {
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch('/api/exams/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          examId: exam.exam_id,
          answers,
        }),
      })

      if (!response.ok) throw new Error('Submission failed')

      const data = await response.json()

      toast.success(`Exam submitted! Score: ${data.score}%`)
      router.push(`/dashboard/student/courses/${exam.course_id}/exams/${exam.exam_id}/results`)
    } catch (error) {
      console.error('Submission error:', error)
      toast.error('Failed to submit exam. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1>{exam.title}</h1>

      {exam.questions.map((question: any, idx: number) => (
        <Card key={question.question_id}>
          <CardHeader>
            <CardTitle className="text-lg">
              Question {idx + 1} ({question.points} points)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>{question.question_text}</p>

            {question.question_type === 'multiple_choice' && (
              <RadioGroup
                value={answers[question.question_id] || ''}
                onValueChange={(value) =>
                  setAnswers({ ...answers, [question.question_id]: value })
                }
              >
                {question.options.map((option: any) => (
                  <div key={option.option_id} className="flex items-center space-x-2">
                    <RadioGroupItem value={option.option_id.toString()} id={`option-${option.option_id}`} />
                    <Label htmlFor={`option-${option.option_id}`}>{option.option_text}</Label>
                  </div>
                ))}
              </RadioGroup>
            )}

            {question.question_type === 'true_false' && (
              <RadioGroup
                value={answers[question.question_id] || ''}
                onValueChange={(value) =>
                  setAnswers({ ...answers, [question.question_id]: value })
                }
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="true" id={`q${question.question_id}-true`} />
                  <Label htmlFor={`q${question.question_id}-true`}>True</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="false" id={`q${question.question_id}-false`} />
                  <Label htmlFor={`q${question.question_id}-false`}>False</Label>
                </div>
              </RadioGroup>
            )}

            {question.question_type === 'free_text' && (
              <Textarea
                value={answers[question.question_id] || ''}
                onChange={(e) =>
                  setAnswers({ ...answers, [question.question_id]: e.target.value })
                }
                placeholder="Type your answer here..."
                rows={4}
              />
            )}
          </CardContent>
        </Card>
      ))}

      <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full">
        {isSubmitting ? 'Submitting...' : 'Submit Exam'}
      </Button>
    </div>
  )
}
```

---

## 3. Course Q&A Chat

### Purpose
General course chatbot that students can use to ask questions about course content, concepts, or get clarification.

### Database Tables

**New Table Needed**:
```sql
CREATE TABLE course_chat_messages (
  message_id SERIAL PRIMARY KEY,
  course_id INTEGER REFERENCES courses(course_id),
  user_id UUID REFERENCES auth.users(id),
  content TEXT NOT NULL,
  role TEXT NOT NULL, -- 'user' or 'assistant'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
CREATE POLICY "Students view own course chat"
ON course_chat_messages FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Students insert own course chat"
ON course_chat_messages FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());
```

### API Route

**File**: `app/api/chat/course/route.ts`

```typescript
import { createClient } from '@/lib/supabase/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextRequest, NextResponse } from 'next/server'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!)
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

export async function POST(request: NextRequest) {
  try {
    const { courseId, message, userId } = await request.json()

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user || user.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get course context with all lessons
    const { data: course } = await supabase
      .from('courses')
      .select(`
        *,
        lessons(title, content, sequence)
      `)
      .eq('course_id', courseId)
      .single()

    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    // Build course knowledge base
    const courseContext = `
**Course:** ${course.title}
**Description:** ${course.description}

**Lessons:**
${course.lessons
  .sort((a, b) => a.sequence - b.sequence)
  .map((lesson) => `- ${lesson.title}: ${lesson.content.substring(0, 200)}...`)
  .join('\n')}
`

    const systemPrompt = `You are a knowledgeable course assistant for an online learning platform.

**Your Role:**
- Answer questions about course content
- Clarify concepts covered in lessons
- Provide additional examples and explanations
- Help students understand relationships between topics
- Encourage continued learning

**Guidelines:**
- Base answers on course content when possible
- If question is outside course scope, say so and offer to help with course topics
- Use clear, educational language
- Provide examples when helpful
- Be encouraging and supportive

**Course Context:**
${courseContext}
`

    // Get chat history
    const { data: chatHistory } = await supabase
      .from('course_chat_messages')
      .select('role, content')
      .eq('course_id', courseId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(20) // Last 20 messages

    // Save user message
    await supabase.from('course_chat_messages').insert({
      course_id: courseId,
      user_id: userId,
      content: message,
      role: 'user',
    })

    // Build chat messages
    const messages = [
      { role: 'user', parts: [{ text: systemPrompt }] },
      ...(chatHistory || []).map((msg) => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      })),
      { role: 'user', parts: [{ text: message }] },
    ]

    // Generate streaming response
    const chat = model.startChat({ history: messages.slice(0, -1) })
    const result = await chat.sendMessageStream(message)

    const encoder = new TextEncoder()
    let fullResponse = ''

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.stream) {
            const text = chunk.text()
            fullResponse += text
            controller.enqueue(encoder.encode(text))
          }

          // Save assistant response
          await supabase.from('course_chat_messages').insert({
            course_id: courseId,
            user_id: userId,
            content: fullResponse,
            role: 'assistant',
          })

          controller.close()
        } catch (error) {
          console.error('Stream error:', error)
          controller.error(error)
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    })
  } catch (error) {
    console.error('Course chat error:', error)
    return NextResponse.json({ error: 'Failed to generate response' }, { status: 500 })
  }
}
```

---

## Environment Variables

Add to `.env.local`:

```bash
# Google Gemini API
GOOGLE_GENERATIVE_AI_API_KEY=your_google_api_key_here

# Alternative: OpenAI (if using GPT-4 instead)
OPENAI_API_KEY=your_openai_api_key_here
```

**Get API Keys:**
- **Google Gemini**: https://aistudio.google.com/app/apikey
- **OpenAI**: https://platform.openai.com/api-keys

---

## Model Comparison

### Google Gemini 2.0 Flash (Recommended)

**Pros:**
- Extremely fast (low latency)
- High quality responses
- Large context window (1M tokens)
- Free tier available (generous limits)
- Good at code understanding
- Supports streaming

**Cons:**
- Newer model (less battle-tested)
- Rate limits on free tier

**Pricing (Paid Tier):**
- Input: $0.075 per 1M tokens
- Output: $0.30 per 1M tokens

### OpenAI GPT-4o

**Pros:**
- Very high quality responses
- Excellent at complex reasoning
- Well-documented
- Reliable and stable

**Cons:**
- More expensive
- Slower than Gemini Flash
- Smaller context window (128K tokens)

**Pricing:**
- Input: $2.50 per 1M tokens
- Output: $10.00 per 1M tokens

**Recommendation**: Use **Gemini 2.0 Flash** for best cost/performance ratio.

---

## Rate Limiting & Cost Management

### Implement Rate Limits

**Per User Rate Limiting**:

```typescript
// lib/rate-limit.ts
import { createClient } from '@/lib/supabase/server'

export async function checkRateLimit(userId: string, action: string, limit: number = 20) {
  const supabase = await createClient()

  // Count actions in last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  const { count } = await supabase
    .from('ai_usage_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('action', action)
    .gte('created_at', oneHourAgo)

  if (count && count >= limit) {
    throw new Error(`Rate limit exceeded. Max ${limit} ${action} requests per hour.`)
  }

  // Log this usage
  await supabase.from('ai_usage_logs').insert({
    user_id: userId,
    action,
    timestamp: new Date().toISOString(),
  })

  return true
}
```

**Usage Logging Table**:

```sql
CREATE TABLE ai_usage_logs (
  log_id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL, -- 'exercise_chat', 'exam_grading', 'course_chat'
  tokens_used INTEGER,
  cost_usd NUMERIC(10, 6),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_usage_user_action ON ai_usage_logs(user_id, action, created_at);
```

### Monitor Costs

Create admin dashboard page to track AI costs:

```typescript
// app/dashboard/admin/ai-usage/page.tsx
const { data: usage } = await supabase
  .from('ai_usage_logs')
  .select('*')
  .gte('created_at', thirtyDaysAgo)

const totalCost = usage?.reduce((sum, log) => sum + (log.cost_usd || 0), 0) || 0
const totalRequests = usage?.length || 0
```

---

## Testing AI Integration

### Manual Testing Checklist

**Exercise Chat:**
- [ ] Chat interface loads correctly
- [ ] Messages stream in real-time
- [ ] Chat history persists across sessions
- [ ] AI provides helpful hints (not direct answers)
- [ ] Error handling works (network failure, API error)

**Exam Grading:**
- [ ] Submission creates record in database
- [ ] AI evaluates all question types correctly
- [ ] Feedback is constructive and accurate
- [ ] Score calculation is correct
- [ ] Results page displays feedback properly

**Course Q&A:**
- [ ] Chat answers questions about course content
- [ ] Handles off-topic questions gracefully
- [ ] Maintains conversation context
- [ ] Chat history loads on page refresh

### Automated Testing (Optional)

```typescript
// tests/ai/exercise-chat.spec.ts
import { test, expect } from '@playwright/test'

test('exercise chat works', async ({ page }) => {
  await page.goto('/dashboard/student/courses/1/exercises/1')

  // Type question
  await page.fill('textarea[placeholder*="Ask a question"]', 'How do I start?')
  await page.click('button[type="submit"]')

  // Wait for response
  await expect(page.locator('text=AI Exercise Assistant')).toBeVisible()
  await expect(page.locator('.assistant-message')).toBeVisible({ timeout: 10000 })
})
```

---

## Security Considerations

### API Key Protection

**Never expose API keys to client:**
- ✅ Store in `.env.local` (server-side only)
- ✅ Call AI from API routes (server-side)
- ❌ Never import API keys in client components
- ❌ Never send API keys to browser

### User Authorization

**Always verify user permissions:**

```typescript
// In every API route
const supabase = await createClient()
const { data: { user }, error } = await supabase.auth.getUser()

if (error || !user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

// Verify user has access to the resource (course, exercise, exam)
const { data: enrollment } = await supabase
  .from('enrollments')
  .select('*')
  .eq('user_id', user.id)
  .eq('course_id', courseId)
  .eq('status', 'active')
  .single()

if (!enrollment) {
  return NextResponse.json({ error: 'Access denied' }, { status: 403 })
}
```

### Input Sanitization

**Prevent prompt injection:**

```typescript
function sanitizeInput(text: string): string {
  // Remove system-level instructions
  return text
    .replace(/system:|assistant:|user:/gi, '')
    .replace(/```/g, '')
    .trim()
}

const sanitizedMessage = sanitizeInput(message)
```

---

## Deployment

### Environment Setup

**Production `.env` variables:**

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Stripe
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# AI
GOOGLE_GENERATIVE_AI_API_KEY=your-gemini-api-key

# Optional
OPENAI_API_KEY=sk-...
```

### Vercel Deployment

1. Push code to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy

**Vercel Configuration**:
- Build Command: `npm run build`
- Output Directory: `.next`
- Install Command: `npm install`

---

## Troubleshooting

### Common Issues

**Issue 1: "API key not found" error**

**Solution**: Verify environment variable is set correctly
```bash
echo $GOOGLE_GENERATIVE_AI_API_KEY
# Should output your key
```

**Issue 2: Streaming not working**

**Solution**: Ensure API route returns proper streaming response
```typescript
return new Response(stream, {
  headers: {
    'Content-Type': 'text/plain; charset=utf-8',
    'Transfer-Encoding': 'chunked',
  },
})
```

**Issue 3: AI gives direct answers instead of hints**

**Solution**: Improve system prompt to emphasize guidance over answers
```typescript
const systemPrompt = `CRITICAL: Never provide complete solutions.
Always ask leading questions and provide hints only.`
```

**Issue 4: Rate limit exceeded**

**Solution**: Implement caching for common questions
```typescript
// Check cache before calling AI
const cached = await redis.get(`chat:${exerciseId}:${hash(message)}`)
if (cached) return cached
```

---

## Next Steps

### Implementation Order

1. **Create Database Tables** (course_chat_messages)
2. **Install AI SDK** (`npm install @google/generative-ai`)
3. **Implement Exam Grading First** (highest priority)
4. **Add Exercise Chat** (enhances learning)
5. **Add Course Q&A** (nice to have)
6. **Setup Rate Limiting** (prevent abuse)
7. **Create Admin Monitoring** (track costs)
8. **Test Thoroughly** (all scenarios)

### Future Enhancements

- [ ] Code execution for programming exercises
- [ ] Image analysis for diagram/visual questions
- [ ] Voice-to-text for audio input
- [ ] Personalized learning recommendations
- [ ] Automated course content generation
- [ ] Plagiarism detection
- [ ] Student progress predictions

---

## Support & Resources

**Documentation:**
- Google Gemini Docs: https://ai.google.dev/gemini-api/docs
- OpenAI API Docs: https://platform.openai.com/docs

**Community:**
- Next.js Discord: https://discord.gg/nextjs
- Supabase Discord: https://discord.supabase.com

**Internal Docs:**
- `docs/DATABASE_SCHEMA.md` - Database tables and relationships
- `docs/AUTH.md` - Authentication flows
- `docs/API_ROUTES.md` - API endpoint reference

---

**Last Updated**: January 31, 2026
**Version**: 1.0.0
**Status**: Ready for Implementation
