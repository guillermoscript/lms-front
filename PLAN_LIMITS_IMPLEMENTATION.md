# Plan Course Limits - Implementation Documentation

## Overview

Implemented **plan-based course creation limits** to enforce monetization tiers for schools. Teachers and admins can only create a limited number of courses based on their tenant's subscription plan.

**Implementation Date:** 2026-02-16  
**Status:** ✅ Complete & Production Ready  
**Build Status:** ✅ Passing  

---

## 🎯 Features Implemented

### Plan Tiers & Limits

| Plan         | Course Limit | Target Audience          |
|--------------|--------------|--------------------------|
| Free         | 5 courses    | Trial users, small schools |
| Basic        | 20 courses   | Small-medium schools     |
| Professional | 100 courses  | Large schools            |
| Enterprise   | Unlimited    | Universities, organizations |

### Enforcement Points
- ✅ Course creation form (UI-level check + server-side enforcement)
- ✅ Server action validation (cannot bypass via API)
- ✅ Real-time limit checking before submission
- ✅ Upgrade prompts when limit reached

---

## 📁 Files Created/Modified

### New Files (2)

#### 1. `app/actions/teacher/courses.ts`
**Purpose:** Server actions for course management with plan enforcement

**Functions:**
```typescript
// Check if tenant can create more courses
checkCourseLimit(): Promise<{
  canCreate: boolean
  currentCount: number
  limit: number
  plan: string
}>

// Create course with limit validation
createCourse(courseData: CourseFormData): Promise<Course>

// Update existing course
updateCourse(courseId: number, courseData: CourseFormData): Promise<{success: boolean}>
```

**Security:**
- ✅ Authenticat validation
- ✅ Role authorization (teacher/admin only)
- ✅ Tenant isolation with `getCurrentTenantId()`
- ✅ Plan limit enforcement on creation
- ✅ Ownership verification on update

**Plan Limits Constants:**
```typescript
const PLAN_LIMITS = {
  free: 5,
  basic: 20,
  professional: 100,
  enterprise: Infinity,
} as const
```

#### 2. Updated `components/teacher/course-form.tsx`
**Purpose:** UI with plan limit warnings and enforcement

**Changes:**
- Replaced direct Supabase calls with server actions
- Added `limitInfo` state to track plan usage
- Shows limit warning when > 80% used
- Blocks creation when limit reached
- Displays upgrade CTA with link to `/pricing`

**UI States:**

**State 1: Normal (under 80% usage)**
- Form displays normally
- No warnings shown

**State 2: Warning (80-99% usage)**
```
┌────────────────────────────────────────┐
│ ⓘ You have used 4 of 5 courses.       │
└────────────────────────────────────────┘
[Form fields...]
```

**State 3: Blocked (100% usage)**
```
┌────────────────────────────────────────┐
│ ⚠ Your free plan is limited to 5      │
│   courses. You currently have 5        │
│   courses.                             │
│                                        │
│   [Cancel] [Upgrade Plan]             │
└────────────────────────────────────────┘
```

---

## 🔄 Workflow

### Course Creation Flow

```
Teacher clicks "New Course"
    ↓
Page loads → checkCourseLimit() called
    ↓
Check current count vs plan limit
    ↓
├─ If limit reached (count >= limit)
│  → Show blocking Alert with upgrade CTA
│  → Hide form
│  → Return early
│
└─ If under limit
   ├─ If > 80% used → Show warning Alert
   └─ Show form normally
       ↓
   User fills form and submits
       ↓
   createCourse() server action called
       ↓
   Server checks limit again (security)
       ↓
   ├─ If limit reached → Throw error
   └─ If under limit → Create course
       ↓
   Success → Redirect to course page
```

### Limit Check Logic

```sql
-- 1. Get tenant's plan
SELECT plan FROM tenants WHERE id = $tenant_id;

-- 2. Get course count for tenant
SELECT COUNT(*) FROM courses WHERE tenant_id = $tenant_id;

-- 3. Compare count vs limit
IF count >= PLAN_LIMITS[plan] THEN
  canCreate = FALSE
ELSE
  canCreate = TRUE
```

---

## 🔒 Security Implementation

### Multi-Layer Validation

**Layer 1: UI Check (User Experience)**
- Client-side `checkCourseLimit()` call on page load
- Prevents form submission if limit reached
- Shows upgrade prompt immediately
- **Purpose:** UX optimization, not security

**Layer 2: Server Action (Security)**
- `createCourse()` checks limit before insert
- Cannot be bypassed via API
- Throws error if limit exceeded
- **Purpose:** Security enforcement

**Example Error:**
```
Error: Your free plan is limited to 5 courses. 
You currently have 5 courses. 
Please upgrade your plan to create more courses.
```

### Tenant Isolation
✅ All queries filter by `tenant_id`
✅ Course count is per-tenant (not global)
✅ Admin bypass not allowed (admins bound to same limits)
✅ Super admin NOT exempt (intentional - ensures billing)

---

## 💡 Monetization Strategy

### Upgrade Path

**When Limit Reached:**
1. User sees blocking alert with clear message
2. "Upgrade Plan" button links to `/pricing`
3. User sees plan comparison with highlighted differences
4. User selects higher tier plan
5. Completes payment (Stripe or Manual)
6. Tenant plan updated → limit increases
7. User can create more courses

### Recommended Pricing Strategy

**Free Plan (5 courses):**
- Perfect for trial/evaluation
- Single teacher testing platform
- Small tutoring operations

**Basic Plan (20 courses) - $X/month:**
- Small schools (100-500 students)
- Multiple teachers
- Growing course catalog

**Professional Plan (100 courses) - $Y/month:**
- Medium-large schools (500-2000 students)
- Full teaching staff
- Comprehensive curriculum

**Enterprise Plan (Unlimited) - Custom:**
- Universities, large organizations
- Unlimited courses, custom features
- Dedicated support

---

## 🧪 Testing Guide

### Manual Testing

#### Test 1: Free Plan Limit (5 courses)
```bash
# As teacher on free plan
1. Create 5 courses (should succeed)
2. Attempt to create 6th course
   - Should see warning at 4/5
   - Should be blocked at 5/5
   - Should see "Upgrade Plan" button
```

#### Test 2: Server Action Security
```bash
# Try to bypass via direct API call
curl -X POST /api/... -d '{"title": "Bypass Course"}'
# Should fail with plan limit error
```

#### Test 3: Upgrade Flow
```bash
1. Hit limit on free plan
2. Click "Upgrade Plan"
3. Navigate to pricing
4. Purchase Basic plan
5. Update tenant.plan = 'basic'
6. Return to new course page
7. Limit should now be 20 courses
8. Should be able to create courses 6-20
```

#### Test 4: Editing Existing Courses
```bash
# Even if at limit
1. Navigate to existing course
2. Click "Edit"
3. Update course details
4. Save
# Should succeed (limit only affects creation)
```

### SQL Test Queries

```sql
-- Check tenant's current usage
SELECT 
  t.name,
  t.plan,
  COUNT(c.course_id) as current_courses,
  CASE t.plan
    WHEN 'free' THEN 5
    WHEN 'basic' THEN 20
    WHEN 'professional' THEN 100
    ELSE 999999
  END as limit
FROM tenants t
LEFT JOIN courses c ON c.tenant_id = t.id
GROUP BY t.id, t.name, t.plan;

-- Find tenants approaching limits
SELECT 
  t.name,
  t.plan,
  COUNT(c.course_id) as current_courses,
  CASE t.plan
    WHEN 'free' THEN 5
    WHEN 'basic' THEN 20
    WHEN 'professional' THEN 100
    ELSE 999999
  END as limit,
  ROUND(COUNT(c.course_id)::numeric / 
    CASE t.plan
      WHEN 'free' THEN 5
      WHEN 'basic' THEN 20
      WHEN 'professional' THEN 100
      ELSE 999999
    END * 100, 2) as usage_percentage
FROM tenants t
LEFT JOIN courses c ON c.tenant_id = t.id
GROUP BY t.id, t.name, t.plan
HAVING COUNT(c.course_id)::numeric / 
  CASE t.plan
    WHEN 'free' THEN 5
    WHEN 'basic' THEN 20
    WHEN 'professional' THEN 100
    ELSE 999999
  END > 0.8;  -- Over 80% usage
```

---

## 📊 Analytics to Track

### Recommended Metrics

1. **Limit Hit Rate**
   - % of tenants that hit their course limit
   - Conversion rate after hitting limit

2. **Usage Distribution**
   ```sql
   SELECT 
     plan,
     AVG(course_count) as avg_courses,
     MAX(course_count) as max_courses,
     COUNT(CASE WHEN course_count >= limit THEN 1 END) as at_limit_count
   FROM (
     SELECT 
       t.plan,
       COUNT(c.course_id) as course_count,
       CASE t.plan
         WHEN 'free' THEN 5
         WHEN 'basic' THEN 20
         WHEN 'professional' THEN 100
         ELSE 999999
       END as limit
     FROM tenants t
     LEFT JOIN courses c ON c.tenant_id = t.id
     GROUP BY t.id, t.plan
   ) usage
   GROUP BY plan;
   ```

3. **Upgrade Funnel**
   - Hit limit → View pricing → Purchase
   - Track conversion at each step

4. **Revenue Impact**
   - Revenue from upgrades triggered by limit
   - Average revenue per upgraded tenant

---

## 🚀 Future Enhancements

### Potential Improvements

1. **Grace Period**
   - Allow 1-2 courses over limit for X days
   - Soft limit vs hard limit
   - Email notifications before enforcing

2. **Archive Instead of Delete**
   - Archived courses don't count toward limit
   - Can un-archive if under limit
   - Preserves historical data

3. **Per-Feature Limits**
   - Courses: 5/20/100/unlimited
   - Students per course: 50/200/500/unlimited
   - Storage: 1GB/10GB/100GB/unlimited
   - Video hosting: None/Limited/Unlimited

4. **Usage Dashboard**
   - Show teachers their current usage
   - Display charts of usage over time
   - Predict when they'll hit limits

5. **Auto-Upgrade Prompts**
   - Email when hitting 80% of limit
   - In-app notifications
   - "Upgrade Now" banner in dashboard

6. **Granular Control**
   - Admin can set custom limits per tenant
   - Override limits for special cases
   - Trial extensions

---

## 📝 Notes for Developers

### Adding New Limits

To add a new plan tier:

1. **Update constant in server action:**
   ```typescript
   // app/actions/teacher/courses.ts
   const PLAN_LIMITS = {
     free: 5,
     basic: 20,
     professional: 100,
     premium: 500,      // ← NEW
     enterprise: Infinity,
   } as const
   ```

2. **No other changes needed!**
   - Component automatically reads from server action
   - Error messages include plan name
   - Limit checks work dynamically

### Changing Existing Limits

```typescript
// To change free plan from 5 to 10 courses
const PLAN_LIMITS = {
  free: 10,  // Changed from 5
  basic: 20,
  professional: 100,
  enterprise: Infinity,
}
```

### Bypassing Limits (Emergency)

**Option 1: Upgrade tenant plan**
```sql
UPDATE tenants SET plan = 'enterprise' WHERE id = 'tenant-uuid';
```

**Option 2: Create as super admin** (NOT CURRENTLY IMPLEMENTED)
- Would require adding super admin check in server action
- Not recommended for normal operations

---

## 🎉 Summary

### What Was Accomplished
✅ Plan-based course limits (free: 5, basic: 20, pro: 100, enterprise: unlimited)  
✅ UI-level warnings (80% usage threshold)  
✅ Server-side enforcement (cannot bypass)  
✅ Clear upgrade path with CTAs  
✅ Multi-tenant isolation  
✅ Security validation at multiple layers  

### Files Created/Modified
- **1 new server actions file** (app/actions/teacher/courses.ts)
- **1 updated component** (components/teacher/course-form.tsx)

### Build Status
✅ TypeScript: No errors  
✅ ESLint: No errors  
✅ Build: Successful  
✅ Production Ready: Yes  

---

**Last Updated:** 2026-02-16  
**Implemented By:** Claude Code  
**Status:** ✅ Complete & Production Ready
