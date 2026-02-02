# LMS V2 - MVP Completion Roadmap

**Current Status**: 85% Complete
**Target**: Production-Ready MVP
**Estimated Time to MVP**: 10-14 hours of development

---

## 🎯 Executive Summary

The LMS platform is **functionally complete** with all major features implemented:
- ✅ Authentication & Authorization
- ✅ Student, Teacher, and Admin Dashboards
- ✅ Course Management & Content Delivery
- ✅ Manual Payment System (fully tested & working)
- ✅ Progress Tracking & Reviews

**However**, there are **3 critical gaps** that make it not ready for students:
1. Exams don't provide feedback (auto-grading not implemented)
2. Payment workflow requires manual emails (no automation)
3. Students can't discover courses (no public catalog)

---

## 🚨 CRITICAL BLOCKERS (Must Complete Before Launch)

### 1. Exam Auto-Grading Implementation ⚠️ **HIGHEST PRIORITY**

**Problem**: Students take exams but receive no feedback or scores
- Exam submissions save to database with `status = 'pending'`
- No AI evaluation runs
- Students never see results
- Makes exams completely unusable

**Current State**:
- ✅ Database table `exam_submissions` ready
- ✅ Frontend exam taking interface works
- ✅ AI integration documented in `/docs/AI_INTEGRATION.md`
- ❌ API route `/api/chat/exam-grade/route.ts` NOT implemented
- ❌ No AI calls to evaluate answers

**Solution**: Implement AI-powered exam grading

**Files to Create**:
```
app/api/chat/exam-grade/route.ts
```

**Implementation Steps**:

1. **Create API Route** - `/app/api/chat/exam-grade/route.ts`
   ```typescript
   import { createClient } from '@/lib/supabase/server'
   import { GoogleGenerativeAI } from '@google/generative-ai'

   export async function POST(request: Request) {
     const { submissionId } = await request.json()

     // 1. Get submission with exam questions
     // 2. Build grading prompt with questions + student answers
     // 3. Call Gemini 2.0 Flash
     // 4. Parse AI response (feedback + score)
     // 5. Save to exam_scores table
     // 6. Return results
   }
   ```

2. **Update Exam Submission Flow** - Trigger grading after submit
   ```typescript
   // In student exam-taker component
   const handleSubmit = async () => {
     // Save submission (existing)
     const { data: submission } = await supabase
       .from('exam_submissions')
       .insert({ ... })

     // NEW: Trigger AI grading
     await fetch('/api/chat/exam-grade', {
       method: 'POST',
       body: JSON.stringify({ submissionId: submission.id })
     })
   }
   ```

3. **Display Results** - Show feedback to student
   ```typescript
   // Create: components/student/exam-results.tsx
   // Show score, feedback, question-by-question breakdown
   ```

**Dependencies**:
- Google AI SDK: `npm install @google/generative-ai`
- Environment variable: `GOOGLE_AI_API_KEY` (or `OPENAI_API_KEY`)

**AI Prompt Template**:
```typescript
const prompt = `You are an expert exam grader. Grade this student's exam submission.

Exam: ${exam.title}

Questions and Student Answers:
${questions.map((q, i) => `
Question ${i+1}: ${q.question_text}
Student Answer: ${answers[q.id]}
${q.question_type === 'multiple_choice' ? `Correct Answer: ${q.correct_answer}` : ''}
`).join('\n')}

Provide:
1. Overall score (0-100)
2. Overall feedback (2-3 sentences)
3. For each question: feedback and points earned

Format as JSON:
{
  "score": 85,
  "overallFeedback": "Great work...",
  "questionFeedback": [
    { "questionId": 1, "feedback": "Correct!", "pointsEarned": 10 },
    ...
  ]
}
`
```

**Testing Checklist**:
- [ ] Student submits exam with all answer types (multiple choice, short answer, essay)
- [ ] AI grading API returns valid score + feedback
- [ ] Results save to `exam_scores` table
- [ ] Student can view their score and feedback
- [ ] Error handling for AI failures (fallback to "pending review")

**Time Estimate**: 4-6 hours

---

### 2. Email Notifications System ⚠️ **HIGH PRIORITY**

**Problem**: Critical workflows require manual email communication
- Admins don't know when students request payment
- Students don't receive payment instructions
- Teachers don't know when courses are approved
- No enrollment confirmation emails

**Current State**:
- ✅ Payment workflow works end-to-end
- ✅ All data saves correctly
- ❌ Zero automated emails
- ❌ All communication must be done manually (phone/external email)

**Solution**: Implement transactional email system

**Recommended Provider**: **Resend** (Modern, React Email templates)

**Setup Steps**:

1. **Install Dependencies**
   ```bash
   npm install resend react-email @react-email/components
   ```

2. **Environment Variable**
   ```bash
   # .env.local
   RESEND_API_KEY=re_...
   ```

3. **Create Email Utilities** - `lib/email/client.ts`
   ```typescript
   import { Resend } from 'resend'

   export const resend = new Resend(process.env.RESEND_API_KEY)

   export async function sendEmail({
     to,
     subject,
     react
   }: {
     to: string
     subject: string
     react: React.ReactElement
   }) {
     return await resend.emails.send({
       from: 'LMS Platform <noreply@yourdomain.com>',
       to,
       subject,
       react
     })
   }
   ```

4. **Create Email Templates**

**Files to Create**:
```
emails/
├── payment-request-admin.tsx      # Notify admin of new request
├── payment-instructions.tsx        # Send payment details to student
├── enrollment-confirmation.tsx     # Welcome email after enrollment
├── course-approved.tsx             # Notify teacher of approval
└── exam-graded.tsx                 # Notify student of exam results
```

**Example Template** - `emails/payment-instructions.tsx`:
```tsx
import { Html, Head, Body, Container, Heading, Text, Button } from '@react-email/components'

export default function PaymentInstructionsEmail({
  studentName,
  productName,
  amount,
  paymentMethod,
  instructions
}: Props) {
  return (
    <Html>
      <Head />
      <Body>
        <Container>
          <Heading>Payment Instructions for {productName}</Heading>
          <Text>Hi {studentName},</Text>
          <Text>Thank you for your interest in {productName}!</Text>

          <Text><strong>Amount:</strong> ${amount}</Text>
          <Text><strong>Payment Method:</strong> {paymentMethod}</Text>

          <Text><strong>Payment Instructions:</strong></Text>
          <Text style={{ whiteSpace: 'pre-wrap' }}>{instructions}</Text>

          <Text>Once we confirm your payment, you'll get instant access to your course.</Text>

          <Button href="https://yourdomain.com/dashboard/student">
            Go to Dashboard
          </Button>
        </Container>
      </Body>
    </Html>
  )
}
```

5. **Integrate into Payment Actions**

**Modify**: `app/actions/payment-requests.ts`

```typescript
import { sendEmail } from '@/lib/email/client'
import PaymentInstructionsEmail from '@/emails/payment-instructions'

// After creating payment request (line ~50)
export async function createPaymentRequest(data: FormData) {
  // ... existing code ...

  // NEW: Notify admin
  await sendEmail({
    to: 'admin@yourdomain.com',
    subject: `New Payment Request from ${data.contact_name}`,
    react: <PaymentRequestAdminEmail
      studentName={data.contact_name}
      productName={product.name}
      amount={product.price}
      requestId={request.request_id}
    />
  })

  return { success: true }
}

// After updating to "contacted" status (line ~120)
export async function updatePaymentRequest(requestId, updates) {
  // ... existing code ...

  // NEW: If status changed to "contacted", send instructions
  if (updates.status === 'contacted' && updates.payment_instructions) {
    await sendEmail({
      to: request.contact_email,
      subject: `Payment Instructions for ${request.product.name}`,
      react: <PaymentInstructionsEmail
        studentName={request.contact_name}
        productName={request.product.name}
        amount={request.payment_amount}
        paymentMethod={updates.payment_method}
        instructions={updates.payment_instructions}
      />
    })
  }

  return { success: true }
}

// After enrollment (line ~240)
export async function confirmPaymentAndEnroll(requestId) {
  // ... existing enrollment code ...

  // NEW: Send enrollment confirmation
  await sendEmail({
    to: request.contact_email,
    subject: `Welcome! You're enrolled in ${courseTitles.join(', ')}`,
    react: <EnrollmentConfirmationEmail
      studentName={request.contact_name}
      courses={courses}
      loginUrl="https://yourdomain.com/auth/login"
    />
  })

  return { success: true }
}
```

6. **Course Approval Email**

**Modify**: `app/actions/admin/courses.ts`

```typescript
// After approving course (line ~30)
export async function approveCourse(courseId: number) {
  // ... existing code ...

  // NEW: Notify teacher
  await sendEmail({
    to: teacher.email,
    subject: `Your course "${course.title}" has been approved!`,
    react: <CourseApprovedEmail
      teacherName={teacher.full_name}
      courseTitle={course.title}
      courseUrl={`https://yourdomain.com/dashboard/teacher/courses/${courseId}`}
    />
  })

  return { success: true }
}
```

**Email Sending Priority**:
1. **Critical**: Payment instructions (manual workflow broken without this)
2. **Important**: Enrollment confirmation (students need to know they have access)
3. **Important**: Admin notification (admins need to know about requests)
4. **Nice**: Course approval (teachers appreciate notification)
5. **Nice**: Exam graded (students get notified via dashboard anyway)

**Testing Checklist**:
- [ ] Admin receives email when student requests payment
- [ ] Student receives payment instructions email
- [ ] Student receives enrollment confirmation email
- [ ] Teacher receives course approval email
- [ ] All emails render correctly on mobile
- [ ] Unsubscribe link works (if applicable)

**Alternative Providers**:
- **SendGrid**: More traditional, battle-tested
- **Postmark**: Great deliverability
- **Amazon SES**: Cheapest option

**Time Estimate**: 3-4 hours

---

### 3. Public Course Catalog ⚠️ **HIGH PRIORITY**

**Problem**: Students can't discover or preview courses
- No way to browse available courses
- Can't see course details before enrolling
- Only products page exists (payment-focused)
- Students need to see syllabus, reviews, instructor info

**Current State**:
- ✅ `/products` page exists (created in testing)
- ✅ `/products/[productId]` page exists
- ❌ No `/courses` page for browsing
- ❌ No `/courses/[courseId]` preview page
- ❌ Courses only visible after enrollment

**Solution**: Create public-facing course catalog

**Files to Create**:
```
app/(public)/courses/page.tsx
app/(public)/courses/[courseId]/page.tsx
components/public/course-card.tsx
components/public/course-hero.tsx
components/public/course-syllabus.tsx
```

**Implementation Steps**:

1. **Course Listing Page** - `/app/(public)/courses/page.tsx`

```typescript
import { createClient } from '@/lib/supabase/server'
import { CourseCard } from '@/components/public/course-card'

export default async function CoursesPage() {
  const supabase = await createClient()

  // Get all published courses
  const { data: courses } = await supabase
    .from('courses')
    .select(`
      *,
      author:profiles(full_name),
      lessons(count),
      reviews(rating),
      enrollments(count)
    `)
    .eq('status', 'published')
    .order('created_at', { ascending: false })

  return (
    <div className="container mx-auto py-12">
      <h1 className="text-4xl font-bold mb-8">Available Courses</h1>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {courses?.map(course => (
          <CourseCard key={course.course_id} course={course} />
        ))}
      </div>
    </div>
  )
}
```

2. **Course Detail/Preview Page** - `/app/(public)/courses/[courseId]/page.tsx`

```typescript
import { createClient } from '@/lib/supabase/server'
import { CourseHero } from '@/components/public/course-hero'
import { CourseSyllabus } from '@/components/public/course-syllabus'
import { CourseReviews } from '@/components/public/course-reviews'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default async function CourseDetailPage({
  params
}: {
  params: Promise<{ courseId: string }>
}) {
  const supabase = await createClient()
  const { courseId } = await params

  // Get course details
  const { data: course } = await supabase
    .from('courses')
    .select(`
      *,
      author:profiles(full_name, bio, avatar_url),
      lessons(lesson_id, title, sequence, description),
      reviews(*, user:profiles(full_name)),
      category:course_categories(name)
    `)
    .eq('course_id', parseInt(courseId))
    .eq('status', 'published')
    .single()

  if (!course) {
    redirect('/courses')
  }

  // Check if user is enrolled
  const { data: { user } } = await supabase.auth.getUser()
  const { data: enrollment } = user ? await supabase
    .from('enrollments')
    .select('enrollment_id')
    .eq('user_id', user.id)
    .eq('course_id', course.course_id)
    .single()
  : { data: null }

  // Find product for this course
  const { data: product } = await supabase
    .from('product_courses')
    .select('product:products(*)')
    .eq('course_id', course.course_id)
    .single()

  return (
    <div className="container mx-auto py-12">
      <CourseHero
        title={course.title}
        description={course.description}
        author={course.author}
        category={course.category.name}
        thumbnail={course.thumbnail_url}
      />

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CourseSyllabus lessons={course.lessons} />
          <CourseReviews reviews={course.reviews} />
        </div>

        <div className="lg:col-span-1">
          <div className="sticky top-4 border rounded-lg p-6">
            <h3 className="text-2xl font-bold mb-4">
              {product?.price ? `$${product.price}` : 'Free'}
            </h3>

            {enrollment ? (
              <Link href={`/dashboard/student/courses/${course.course_id}`}>
                <Button className="w-full" size="lg">
                  Go to Course
                </Button>
              </Link>
            ) : product ? (
              <Link href={`/products/${product.product_id}`}>
                <Button className="w-full" size="lg">
                  Enroll Now
                </Button>
              </Link>
            ) : (
              <Button className="w-full" size="lg" disabled>
                Not Available
              </Button>
            )}

            <div className="mt-6 space-y-2 text-sm">
              <div>📚 {course.lessons.length} lessons</div>
              <div>⏱️ Self-paced learning</div>
              <div>📱 Mobile friendly</div>
              <div>🎓 Certificate on completion</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

3. **Course Card Component** - `/components/public/course-card.tsx`

```typescript
'use client'

import Link from 'next/link'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export function CourseCard({ course }: { course: any }) {
  const avgRating = course.reviews?.length
    ? (course.reviews.reduce((sum: number, r: any) => sum + r.rating, 0) / course.reviews.length).toFixed(1)
    : null

  return (
    <Link href={`/courses/${course.course_id}`}>
      <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer">
        <CardHeader>
          {course.thumbnail_url && (
            <img
              src={course.thumbnail_url}
              alt={course.title}
              className="w-full h-48 object-cover rounded-t-lg"
            />
          )}
        </CardHeader>

        <CardContent>
          <h3 className="text-xl font-bold mb-2">{course.title}</h3>
          <p className="text-muted-foreground line-clamp-2">
            {course.description}
          </p>

          <div className="mt-4 flex items-center gap-2">
            {avgRating && (
              <div className="flex items-center gap-1">
                <span className="text-yellow-500">★</span>
                <span className="font-medium">{avgRating}</span>
                <span className="text-sm text-muted-foreground">
                  ({course.reviews.length})
                </span>
              </div>
            )}
          </div>
        </CardContent>

        <CardFooter className="flex justify-between">
          <span className="text-sm text-muted-foreground">
            By {course.author.full_name}
          </span>
          <Badge variant="secondary">
            {course.lessons[0].count} lessons
          </Badge>
        </CardFooter>
      </Card>
    </Link>
  )
}
```

4. **Update Navigation** - Add "Courses" link to public header

**Modify**: `app/(public)/layout.tsx` or main navigation component

```typescript
<nav>
  <Link href="/courses">Courses</Link>
  <Link href="/products">Products</Link>
  <Link href="/about">About</Link>
</nav>
```

5. **SEO Optimization** - Add metadata

```typescript
// In courses/page.tsx
export const metadata = {
  title: 'Browse Courses | LMS Platform',
  description: 'Discover and enroll in courses taught by expert instructors'
}

// In courses/[courseId]/page.tsx
export async function generateMetadata({ params }) {
  const { courseId } = await params
  const course = await getCourse(courseId)

  return {
    title: `${course.title} | LMS Platform`,
    description: course.description
  }
}
```

**Features to Include**:
- ✅ Course grid with thumbnails
- ✅ Star ratings and review counts
- ✅ Lesson count
- ✅ Instructor name
- ✅ Course preview with full syllabus
- ✅ Enroll button (links to product)
- ✅ "Already enrolled" state

**Nice-to-Have Features** (optional):
- [ ] Filter by category
- [ ] Search functionality
- [ ] Sort by rating/popularity
- [ ] Course difficulty badges
- [ ] Estimated completion time

**Testing Checklist**:
- [ ] All published courses appear in listing
- [ ] Course cards are clickable and navigate correctly
- [ ] Course detail page shows full information
- [ ] Enrolled students see "Go to Course" button
- [ ] Non-enrolled students see "Enroll Now" button
- [ ] Mobile responsive design
- [ ] SEO metadata renders correctly

**Time Estimate**: 3-4 hours

---

## ⚠️ IMPORTANT (Complete Within Week 1)

### 4. Exercise Chat Assistant

**Problem**: Students viewing exercises have no way to get help
- Exercise page shows instructions
- Student can write code/answer
- No help system available
- Would significantly improve learning experience

**Current State**:
- ✅ Database tables exist (`exercises`, `exercise_messages`)
- ✅ AI integration documented
- ❌ Chat UI not implemented
- ❌ API route not created

**Solution**: Add AI-powered help chat for exercises

**Files to Create**:
```
app/api/chat/exercise/route.ts
components/student/exercise-chat.tsx
```

**Implementation**: Follow pattern from `/docs/AI_INTEGRATION.md`

**Time Estimate**: 4-5 hours

---

### 5. Teacher Submission Review Interface

**Problem**: Teachers can't easily review student exam submissions
- Students submit exams
- AI grades them (once implemented)
- Teachers have no UI to review, override, or add comments

**Current State**:
- ✅ Submissions save to database
- ❌ No teacher review page
- ❌ Teachers can't override AI scores
- ❌ Teachers can't add manual feedback

**Solution**: Create submission review dashboard

**Files to Create**:
```
app/dashboard/teacher/courses/[courseId]/exams/[examId]/submissions/page.tsx
components/teacher/submission-review.tsx
app/actions/teacher/submissions.ts
```

**Features Needed**:
- List all submissions for an exam
- View student answers
- See AI feedback
- Override score manually
- Add teacher comments
- Mark as "reviewed"

**Time Estimate**: 3-4 hours

---

### 6. Invoice PDF Generation

**Problem**: Invoices are HTML only, not downloadable PDFs
- Current: `/api/invoices/[number]` returns HTML page
- Admins/students have to print to PDF manually
- Looks less professional

**Current State**:
- ✅ Invoice generation works
- ✅ Invoice HTML template exists
- ❌ No PDF generation

**Solution**: Use Puppeteer to convert HTML to PDF

**Implementation**:

```bash
npm install puppeteer
```

```typescript
// app/api/invoices/[invoiceNumber]/pdf/route.ts
import puppeteer from 'puppeteer'

export async function GET(request: Request, { params }) {
  const { invoiceNumber } = await params

  // Get invoice data (same as HTML version)
  const invoice = await getInvoice(invoiceNumber)

  // Render HTML (same template)
  const html = renderInvoiceHTML(invoice)

  // Convert to PDF
  const browser = await puppeteer.launch()
  const page = await browser.newPage()
  await page.setContent(html)
  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true
  })
  await browser.close()

  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="invoice-${invoiceNumber}.pdf"`
    }
  })
}
```

**Time Estimate**: 2-3 hours

---

## 🎨 POLISH & ENHANCEMENTS (Week 2-3)

### 7. Internationalization Integration

**Status**: Translation files exist but unused

**What Exists**:
- ✅ `/messages/en.json` (200+ keys)
- ✅ `/messages/es.json` (200+ keys)
- ✅ `i18n.ts` config
- ✅ Language switcher component

**What's Needed**:
- Replace all hardcoded strings with `useTranslations()` hook
- Add language switcher to navigation
- Set default locale based on browser

**Example**:
```typescript
// Current (hardcoded)
<h1>Welcome to LMS</h1>

// After (internationalized)
import { useTranslations } from 'next-intl'

const t = useTranslations()
<h1>{t('common.welcome')}</h1>
```

**Time Estimate**: 6-8 hours

---

### 8. Global Search (Cmd+K)

**Status**: Not implemented

**Features**:
- Global search modal (⌘K / Ctrl+K)
- Search courses, lessons, exercises
- Quick navigation
- Recent searches

**Implementation**: Use `cmdk` library + Algolia/MeiliSearch

**Time Estimate**: 4-6 hours

---

### 9. Certificate Generation

**Status**: Not implemented

**Features**:
- Automatic certificate on course completion
- PDF generation with student name, course title, date
- Download from dashboard
- Verification system (unique certificate ID)

**Implementation**: Similar to invoice PDF generation

**Time Estimate**: 4-5 hours

---

### 10. Admin: Category Management UI

**Status**: Server actions exist, UI missing

**What Exists**:
- ✅ `app/actions/admin/categories.ts` (CRUD functions)

**What's Needed**:
- Create `/dashboard/admin/categories/page.tsx`
- Create category form dialog
- Add to admin navigation

**Time Estimate**: 2 hours

---

### 11. Admin: Product & Plan Management (Stripe)

**Status**: Manual payment works, Stripe products not manageable from UI

**What Exists**:
- ✅ Products table with Stripe fields
- ✅ Manual products work perfectly

**What's Needed**:
- Product creation form with Stripe sync
- Plan (subscription) creation form
- Course linking interface

**Time Estimate**: 8-10 hours

---

## 📊 Development Priority Matrix

### Must Have (Before Student Launch)
| Feature | Priority | Effort | Impact | Status |
|---------|----------|--------|--------|--------|
| Exam Auto-Grading | 🔴 Critical | 4-6h | High | ❌ Not Started |
| Email Notifications | 🔴 Critical | 3-4h | High | ❌ Not Started |
| Public Course Catalog | 🔴 Critical | 3-4h | High | ❌ Not Started |

### Should Have (Week 1)
| Feature | Priority | Effort | Impact | Status |
|---------|----------|--------|--------|--------|
| Exercise Chat | 🟡 Important | 4-5h | Medium | ❌ Not Started |
| Teacher Reviews | 🟡 Important | 3-4h | Medium | ❌ Not Started |
| PDF Invoices | 🟡 Important | 2-3h | Low | ❌ Not Started |

### Nice to Have (Week 2-3)
| Feature | Priority | Effort | Impact | Status |
|---------|----------|--------|--------|--------|
| i18n Integration | 🟢 Enhancement | 6-8h | Medium | ❌ Not Started |
| Global Search | 🟢 Enhancement | 4-6h | Medium | ❌ Not Started |
| Certificates | 🟢 Enhancement | 4-5h | Low | ❌ Not Started |
| Category UI | 🟢 Enhancement | 2h | Low | ❌ Not Started |
| Stripe Products UI | 🟢 Enhancement | 8-10h | Low | ❌ Not Started |

---

## 🚀 Implementation Phases

### Phase 1: MVP Launch Blockers (10-14 hours)
**Goal**: Make platform ready for first students

**Week 1 - Days 1-2**:
1. ✅ Exam auto-grading (4-6h)
2. ✅ Email notifications (3-4h)
3. ✅ Public course catalog (3-4h)

**Deliverable**: Fully functional LMS that students can use independently

---

### Phase 2: Polish & Expansion (9-12 hours)
**Goal**: Improve teacher experience and professionalism

**Week 1 - Days 3-5**:
1. Exercise chat assistant (4-5h)
2. Teacher submission review (3-4h)
3. PDF invoice generation (2-3h)

**Deliverable**: More polished experience with better support systems

---

### Phase 3: Enhancements (20-25 hours)
**Goal**: Scalability and advanced features

**Week 2-3**:
1. Internationalization (6-8h)
2. Global search (4-6h)
3. Certificate generation (4-5h)
4. Category management UI (2h)
5. Stripe product management (8-10h)

**Deliverable**: Production-grade platform with all features

---

## 🧪 Testing Strategy

### Pre-Launch Testing (After Phase 1)

**Critical Path Testing**:
1. Student Journey
   - [ ] Browse courses
   - [ ] Enroll in course (manual payment)
   - [ ] Complete lesson
   - [ ] Take exam
   - [ ] Receive grade and feedback
   - [ ] View certificate

2. Payment Workflow
   - [ ] Student requests payment
   - [ ] Admin receives email
   - [ ] Admin sends instructions
   - [ ] Student receives email
   - [ ] Admin confirms payment
   - [ ] Student receives enrollment email
   - [ ] Student can access course

3. Teacher Workflow
   - [ ] Create course
   - [ ] Add lessons
   - [ ] Create exam
   - [ ] Publish course
   - [ ] View student progress

4. Admin Workflow
   - [ ] Approve course
   - [ ] Process payment request
   - [ ] View analytics
   - [ ] Manage users

### Automated Testing (Future)
- [ ] Playwright E2E tests for critical paths
- [ ] Unit tests for AI grading logic
- [ ] Integration tests for email sending

---

## 🔧 Environment Setup Requirements

### Required Environment Variables

**Current** (Already Set):
```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

**New (To Add)**:
```bash
# AI Integration
GOOGLE_AI_API_KEY=...              # For exam grading and exercise chat
# OR
OPENAI_API_KEY=...                 # Alternative

# Email Service (Choose One)
RESEND_API_KEY=...                 # Recommended
# OR
SENDGRID_API_KEY=...              # Alternative
# OR
POSTMARK_API_KEY=...              # Alternative

# Invoice Branding (Optional)
COMPANY_NAME="Your LMS Platform"
COMPANY_ADDRESS="123 Education St"
COMPANY_EMAIL="billing@yourdomain.com"
COMPANY_PHONE="+1 555 123 4567"

# App URL (for email links)
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

---

## 📈 Success Metrics

### MVP Launch Criteria
- [ ] Students can discover and enroll in courses
- [ ] Students receive automated payment instructions
- [ ] Exams provide automatic feedback
- [ ] Teachers can create and publish content
- [ ] Admins can manage platform operations
- [ ] Zero critical bugs
- [ ] Mobile responsive
- [ ] Page load < 2 seconds

### Week 1 Goals
- [ ] First 10 students enrolled
- [ ] 100% email delivery rate
- [ ] 95%+ exam grading accuracy
- [ ] Zero payment processing delays

---

## 🆘 Contingency Plans

### If Timeline is Tight

**Minimum Viable Launch** (Can skip):
- ❌ Exercise chat (students can email questions)
- ❌ Teacher review UI (use database directly)
- ❌ PDF invoices (HTML print works)
- ❌ All Phase 3 features

**Cannot Skip**:
- ✅ Exam grading (exams are broken without it)
- ✅ Email notifications (manual workflow too slow)
- ✅ Course catalog (students can't find courses)

### Workarounds if AI Fails
- **Exam Grading**: Fallback to "pending review" + manual teacher grading
- **Exercise Chat**: Remove "Get Help" button temporarily

### Workarounds if Email Fails
- Use personal email account manually (not scalable)
- Show payment instructions in UI after submission

---

## 📝 Documentation Updates Needed

After implementation, update:
- [ ] `PROJECT_COMPLETE.md` - Add Phase 11 (MVP Launch)
- [ ] `AI_INTEGRATION.md` - Mark as implemented
- [ ] `MANUAL_PAYMENT_SYSTEM.md` - Add email sections
- [ ] Create `DEPLOYMENT_GUIDE.md` - Production setup
- [ ] Create `ADMIN_GUIDE.md` - How to use admin dashboard
- [ ] Create `TEACHER_GUIDE.md` - Content creation guide

---

## 🎯 Next Steps

### Immediate Actions (Today)
1. Review this roadmap
2. Prioritize features based on your needs
3. Decide on AI provider (Gemini vs OpenAI)
4. Decide on email provider (Resend vs SendGrid)
5. Get API keys ready

### Tomorrow - Start Implementation
**Recommended Order**:
1. ✅ Setup environment variables
2. ✅ Implement exam auto-grading
3. ✅ Implement email notifications
4. ✅ Create public course catalog
5. ✅ Test complete student journey
6. ✅ Launch to first students

---

## 💡 Additional Recommendations

### Cost Optimization
- **AI**: Gemini 2.0 Flash ($0.075/1M tokens) vs GPT-4o ($2.50/1M tokens)
  - Estimated: 100 exams/day × 2K tokens = $0.015/day with Gemini
- **Email**: Resend (50K free emails/month) vs SendGrid (100/day free)
  - Estimated: 100 emails/day = free with Resend

### Security Reminders
- [ ] Rate limit AI endpoints (max 10 requests/minute per user)
- [ ] Validate all AI responses before saving
- [ ] Sanitize HTML in student answers
- [ ] Don't expose service role key to client

### Performance Tips
- [ ] Cache course catalog (ISR with 1 hour revalidation)
- [ ] Lazy load course images
- [ ] Stream AI responses (don't wait for full response)

---

**Document Version**: 1.0
**Last Updated**: February 1, 2026
**Next Review**: After Phase 1 completion
