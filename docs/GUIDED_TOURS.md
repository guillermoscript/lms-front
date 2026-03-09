# Guided Tours System

Interactive onboarding tours built with [Driver.js](https://driverjs.com/) (~5KB, vanilla JS, React 19 compatible).

## Architecture

```
components/tours/
├── guided-tour.tsx          # Core wrapper — localStorage persistence, reduced-motion, auto-start
├── tour-styles.css          # Dark popover theme (light + dark mode)
├── tour-definitions.ts      # Step arrays per tour (takes translation fn)
├── tour-trigger.tsx          # Replay button (HelpCircle icon + tooltip)
├── admin-dashboard-tour.tsx   # Admin dashboard wrapper
├── teacher-dashboard-tour.tsx # Teacher dashboard wrapper
├── student-dashboard-tour.tsx  # Student dashboard wrapper
├── course-editor-tour.tsx     # Course editor wrapper
└── lesson-editor-tour.tsx     # Lesson editor wrapper
```

### How It Works

1. **GuidedTour** component checks `localStorage` key `tour-completed:{tourId}:{userId}`
2. If not completed, auto-starts after 800ms delay (DOM readiness)
3. On dismiss/complete, marks tour as completed in localStorage
4. Respects `prefers-reduced-motion` (disables animations)
5. **TourTrigger** button clears localStorage and restarts the tour

### Adding `data-tour` Attributes

Target elements use `data-tour="identifier"` attributes. For sidebar items, use the `tourId` prop on `NavItem` in `app-sidebar.tsx`.

### Translation Pattern

Tour steps use namespace-relative keys via `useTranslations()`:
```ts
// In wrapper component:
const t = useTranslations('dashboard.teacher.manageCourse')
// In definition:
t('tour.header.title') // resolves to dashboard.teacher.manageCourse.tour.header.title
```

## Existing Tours

### Admin Dashboard (`admin-dashboard`)
- **Page:** `/dashboard/admin`
- **Steps:** 5 — Onboarding checklist → Plan/usage → Stats grid → Sidebar settings → Sidebar courses
- **Translations:** `dashboard.admin.main.tour.*`

### Teacher Dashboard (`teacher-dashboard`)
- **Page:** `/dashboard/teacher`
- **Steps:** 5 — Welcome → Stats → Courses → Sidebar courses → Sidebar create
- **Translations:** `dashboard.teacher.tour.*`

### Course Editor (`course-editor`)
- **Page:** `/dashboard/teacher/courses/[courseId]`
- **Steps:** 6 — Header/status → Tabs navigation → Lessons tab → Exercises tab → Preview button → Settings button
- **Translations:** `dashboard.teacher.manageCourse.tour.*`

### Student Dashboard (`student-dashboard`)
- **Page:** `/dashboard/student`
- **Steps:** 6 — Welcome → Stats → Courses → Leaderboard/Activity sidebar → Browse courses → Progress report
- **Translations:** `dashboard.student.tour.*`

### Lesson Editor (`lesson-editor`)
- **Page:** `/dashboard/teacher/courses/[courseId]/lessons/[lessonId]` (and `/lessons/new`)
- **Steps:** 5 — Header/breadcrumb → Three-step workflow (Details/Content/AI Task) → Visual/MDX toggle → Live preview → Save/Publish
- **Translations:** `dashboard.teacher.lessonEditor.tour.*`

## Planned Tours (not yet implemented)

| Tour | Page | Priority | Notes |
|------|------|----------|-------|
| Monetization Setup | `/dashboard/admin/monetization` | Medium | Products, plans, Stripe connect setup flow |
| Student Course View | `/dashboard/student/courses/[id]` | Medium | Lesson navigation, progress, exams, exercises |
| Analytics | `/dashboard/admin/analytics` | Medium | Charts, date ranges, export |
| Landing Page Builder | `/dashboard/admin/landing-page` | Medium | Puck drag-and-drop, templates, preview |
| Billing/Upgrade | `/dashboard/admin/billing` | Low | Plan tiers, upgrade flow |
| User Management | `/dashboard/admin/users` | Low | Invite flow, role management |

## Adding a New Tour

1. **Define steps** in `tour-definitions.ts`:
   ```ts
   export function getMyFeatureTour(t: (key: string) => string): DriveStep[] {
     return [
       { element: '[data-tour="my-element"]', popover: { title: t('tour.step.title'), description: t('tour.step.description') } },
     ]
   }
   ```

2. **Add `data-tour` attributes** to target elements in the page component

3. **Create wrapper component** (copy pattern from existing wrappers):
   ```tsx
   // components/tours/my-feature-tour.tsx
   'use client'
   import { useCallback, useState } from 'react'
   import { useTranslations } from 'next-intl'
   import { GuidedTour } from './guided-tour'
   import { getMyFeatureTour } from './tour-definitions'
   import { TourTrigger } from './tour-trigger'

   const TOUR_ID = 'my-feature'

   export function MyFeatureTour({ userId }: { userId: string }) {
     const t = useTranslations('my.namespace')
     const [restartKey, setRestartKey] = useState(0)
     const steps = getMyFeatureTour(t)
     const handleRestart = useCallback(() => setRestartKey((k) => k + 1), [])

     return (
       <>
         <div className="fixed right-4 top-4 z-40">
           <TourTrigger tourId={TOUR_ID} userId={userId} onRestart={handleRestart} />
         </div>
         <GuidedTour key={restartKey} tourId={TOUR_ID} userId={userId} steps={steps} />
       </>
     )
   }
   ```

4. **Add translations** to `messages/en.json` and `messages/es.json`

5. **Import and render** in the page's server component:
   ```tsx
   import { MyFeatureTour } from '@/components/tours/my-feature-tour'
   // ...
   <MyFeatureTour userId={user.id} />
   ```
