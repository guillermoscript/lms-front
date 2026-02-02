# Internationalization (i18n) Guide

**Implementation**: next-intl
**Supported Languages**: English (en), Spanish (es)
**Status**: ✅ Fully Configured

---

## Overview

This LMS platform supports multiple languages using `next-intl`, a powerful i18n library for Next.js 13+. Users can switch between languages dynamically, and their preference is preserved across sessions.

---

## Supported Languages

| Code | Language | Status |
|------|----------|--------|
| `en` | English  | ✅ Complete |
| `es` | Español  | ✅ Complete |

**Default Language**: English (`en`)

---

## Directory Structure

```
├── messages/
│   ├── en.json                 # English translations
│   └── es.json                 # Spanish translations
├── components/
│   └── language-switcher.tsx   # Language switcher component
├── i18n.ts                     # i18n configuration
└── middleware.ts               # Locale detection middleware
```

---

## Translation Files

### Location
All translation files are located in the `/messages` directory with the naming convention `{locale}.json`.

### Structure
Translations are organized hierarchically by feature:

```json
{
  "common": { ... },      // Common UI elements
  "auth": { ... },        // Authentication
  "dashboard": {
    "student": { ... },   // Student dashboard
    "teacher": { ... },   // Teacher dashboard
    "admin": { ... }      // Admin dashboard
  },
  "course": { ... },      // Course-related
  "lesson": { ... },      // Lesson-related
  "exam": { ... },        // Exam-related
  "review": { ... },      // Reviews
  "enrollment": { ... },  // Enrollments
  "user": { ... },        // User management
  "transaction": { ... }, // Transactions
  "stats": { ... },       // Statistics
  "actions": { ... },     // Actions/buttons
  "validation": { ... },  // Form validation
  "messages": { ... }     // System messages
}
```

---

## Usage

### In Server Components

```typescript
import { useTranslations } from 'next-intl'

export default function MyComponent() {
  const t = useTranslations('dashboard.student')

  return (
    <div>
      <h1>{t('title')}</h1>
      <p>{t('welcome')}</p>
    </div>
  )
}
```

### In Client Components

```typescript
'use client'

import { useTranslations } from 'next-intl'

export function MyClientComponent() {
  const t = useTranslations('common')

  return (
    <button>{t('save')}</button>
  )
}
```

### Accessing Nested Keys

```typescript
const t = useTranslations('dashboard')

// Access: dashboard.student.title
<h1>{t('student.title')}</h1>

// Or use a specific namespace
const studentT = useTranslations('dashboard.student')
<h1>{studentT('title')}</h1>
```

### Pluralization

```json
{
  "items": "{count, plural, =0 {No items} =1 {1 item} other {# items}}"
}
```

```typescript
t('items', { count: 0 })  // "No items"
t('items', { count: 1 })  // "1 item"
t('items', { count: 5 })  // "5 items"
```

### Variables/Interpolation

```json
{
  "welcome": "Welcome, {name}!"
}
```

```typescript
t('welcome', { name: 'John' })  // "Welcome, John!"
```

---

## Language Switcher

### Component
The `LanguageSwitcher` component is available globally and can be added to any layout or page.

### Usage

```typescript
import { LanguageSwitcher } from '@/components/language-switcher'

export default function Layout() {
  return (
    <header>
      <nav>
        {/* Other nav items */}
        <LanguageSwitcher />
      </nav>
    </header>
  )
}
```

### Features
- Dropdown selector with language names
- Current language highlighted
- Preserves current path when switching
- Updates URL with locale prefix (e.g., `/en/dashboard` → `/es/dashboard`)

---

## URL Structure

### Default (English)
```
/dashboard/student              # No prefix for default locale
/dashboard/teacher
/auth/login
```

### Spanish
```
/es/dashboard/student           # Spanish prefix
/es/dashboard/teacher
/es/auth/login
```

### Configuration
The middleware uses `localePrefix: 'as-needed'`:
- Default locale (English): No prefix
- Other locales (Spanish): Prefixed with locale code

---

## Adding a New Language

### Step 1: Add Locale to Config

Edit `i18n.ts`:

```typescript
export const locales = ['en', 'es', 'fr'] as const  // Add 'fr'

export const localeNames: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',  // Add French
}
```

### Step 2: Create Translation File

Create `messages/fr.json` by copying `messages/en.json` and translating all strings.

### Step 3: Update Middleware

Edit `middleware.ts`:

```typescript
export const config = {
  matcher: ['/', '/(en|es|fr)/:path*'],  // Add 'fr'
}
```

### Step 4: Test

1. Navigate to `/fr/dashboard`
2. Verify all translations display correctly
3. Test language switcher includes new language

---

## Translation Keys Reference

### Common (`common`)
- `loading`, `error`, `save`, `cancel`, `delete`, `edit`, `create`, `submit`
- `search`, `back`, `next`, `previous`, `continue`, `close`

### Authentication (`auth`)
- `login`, `signup`, `logout`, `email`, `password`
- `forgotPassword`, `resetPassword`, `dontHaveAccount`, `alreadyHaveAccount`

### Dashboard (`dashboard`)
- **Student**: `title`, `welcome`, `enrolledCourses`, `lessonsCompleted`, etc.
- **Teacher**: `title`, `welcome`, `createCourse`, `totalCourses`, etc.
- **Admin**: `title`, `welcome`, `totalUsers`, `quickActions`, etc.

### Course (`course`)
- `title`, `description`, `lessons`, `exams`, `students`, `progress`
- `complete`, `completed`, `inProgress`, `notStarted`
- `published`, `draft`, `archived`

### Lesson (`lesson`)
- `markAsComplete`, `completed`, `duration`, `minutes`
- `comments`, `noComments`, `postComment`

### Exam (`exam`)
- `startExam`, `submitExam`, `timeRemaining`, `questions`
- `multipleChoice`, `trueFalse`, `freeText`
- `score`, `passed`, `failed`, `results`

### Review (`review`)
- `yourRating`, `yourReview`, `submitReview`
- `noReviews`, `alreadyReviewed`, `averageRating`

### User (`user`)
- `profile`, `settings`, `account`, `name`, `email`, `role`
- `student`, `teacher`, `admin`, `joined`

### Actions (`actions`)
- `preview`, `publish`, `unpublish`, `archive`, `restore`
- `duplicate`, `export`, `import`, `viewAll`, `viewDetails`

### Validation (`validation`)
- `required`, `emailInvalid`, `passwordTooShort`, `passwordsMustMatch`

### Messages (`messages`)
- `success`, `saveSuccess`, `deleteSuccess`, `errorOccurred`
- `confirmDelete`, `unsavedChanges`

---

## Best Practices

### 1. **Always Use Translation Keys**
❌ **Don't**: Hardcode strings
```typescript
<h1>Welcome to the Dashboard</h1>
```

✅ **Do**: Use translation keys
```typescript
<h1>{t('dashboard.student.welcome')}</h1>
```

### 2. **Organize by Feature**
Group related translations under a common namespace:
```json
{
  "course": {
    "title": "Course",
    "description": "Description",
    "lessons": "Lessons"
  }
}
```

### 3. **Keep Keys Descriptive**
Use clear, semantic key names:
```json
{
  "submitReview": "Submit Review",        // ✅ Clear
  "btn1": "Submit Review"                 // ❌ Unclear
}
```

### 4. **Avoid Nested Components in Translations**
Translation strings should be plain text, not JSX:
```json
{
  "terms": "I agree to the Terms and Conditions"  // ✅
}
```

For links, use rich text or split the translation:
```json
{
  "termsPrefix": "I agree to the",
  "termsLink": "Terms and Conditions"
}
```

### 5. **Use Variables for Dynamic Content**
```json
{
  "enrolled": "Enrolled on {date}",
  "progress": "{completed} of {total} lessons completed"
}
```

```typescript
t('enrolled', { date: '2024-01-31' })
t('progress', { completed: 5, total: 10 })
```

### 6. **Maintain Consistency**
Use consistent terminology across all translations:
- "Login" (not "Sign In" in some places and "Log In" in others)
- "Course" (not "Class" or "Program")
- "Lesson" (not "Lecture" or "Module")

---

## Testing Translations

### Manual Testing
1. Switch language using the LanguageSwitcher
2. Navigate through all pages
3. Verify all text displays in correct language
4. Check for missing translations (shows key instead of text)

### Automated Testing
```typescript
// Test language switcher
test('should switch language', async () => {
  const { getByRole } = render(<LanguageSwitcher />)
  const selector = getByRole('combobox')

  fireEvent.change(selector, { target: { value: 'es' } })
  expect(window.location.pathname).toContain('/es')
})
```

### Check for Missing Keys
```bash
# Compare English and Spanish keys
diff <(jq -r 'keys' messages/en.json) <(jq -r 'keys' messages/es.json)
```

---

## Common Issues & Solutions

### Issue 1: Translation Key Not Found
**Symptom**: Page shows key instead of translated text (e.g., `dashboard.student.title`)

**Solution**:
1. Check that the key exists in the translation file
2. Verify the namespace is correct
3. Ensure the translation file is imported correctly

### Issue 2: Wrong Language Displays
**Symptom**: Spanish text shows when English is selected

**Solution**:
1. Clear browser cache
2. Check URL for correct locale prefix
3. Verify `defaultLocale` in `i18n.ts`

### Issue 3: Language Doesn't Persist
**Symptom**: Language resets on page refresh

**Solution**:
- The middleware handles persistence via URL
- Ensure all internal links use the locale-aware router
- Don't use regular `<a>` tags, use Next.js `<Link>`

### Issue 4: Build Errors
**Symptom**: `Module not found: Can't resolve './messages/en.json'`

**Solution**:
1. Ensure `messages/` directory exists
2. Verify all locale files are present (en.json, es.json)
3. Check file names match locale codes exactly

---

## Migration Guide

### Converting Hardcoded Text to i18n

#### Before (Hardcoded)
```typescript
export default function StudentDashboard() {
  return (
    <div>
      <h1>My Learning</h1>
      <p>Welcome back! Continue where you left off.</p>
      <div>
        <span>Enrolled Courses</span>
        <span>Lessons Completed</span>
      </div>
    </div>
  )
}
```

#### After (i18n)
```typescript
import { useTranslations } from 'next-intl'

export default function StudentDashboard() {
  const t = useTranslations('dashboard.student')

  return (
    <div>
      <h1>{t('title')}</h1>
      <p>{t('welcome')}</p>
      <div>
        <span>{t('enrolledCourses')}</span>
        <span>{t('lessonsCompleted')}</span>
      </div>
    </div>
  )
}
```

---

## Performance

### Bundle Size
- Each locale adds ~10-15KB to the bundle
- Translations are loaded on-demand per page
- Only the active locale is loaded

### Caching
- Translation files are cached by the browser
- Changes to translations require browser cache clear in development
- Production builds have cache busting via build hashes

---

## Roadmap

### Planned Languages
- [ ] French (fr)
- [ ] German (de)
- [ ] Portuguese (pt)
- [ ] Italian (it)
- [ ] Chinese (zh)
- [ ] Japanese (ja)

### Future Features
- [ ] RTL (Right-to-Left) support for Arabic/Hebrew
- [ ] Date/time localization
- [ ] Number formatting per locale
- [ ] Currency formatting
- [ ] Timezone support

---

## Resources

- **next-intl Documentation**: https://next-intl-docs.vercel.app/
- **Translation Files**: `/messages/`
- **Configuration**: `/i18n.ts`
- **Middleware**: `/middleware.ts`

---

## Support

For translation contributions or issues:
1. Create a new translation file in `/messages/{locale}.json`
2. Copy the structure from `en.json`
3. Translate all strings
4. Test thoroughly
5. Submit a pull request

---

**Last Updated**: January 31, 2026
**Version**: 1.0.0
