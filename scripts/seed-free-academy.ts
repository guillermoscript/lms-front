/**
 * Seed the "Free Academy" demo tenant into the LOCAL Supabase stack.
 *
 * Creates: the tenant (on a paid plan so the landing builder is unlocked), an
 * admin + a teacher + a student + 3 reviewer students, two published courses
 * (one FREE, one paid) with lessons, two plans, course reviews (→ testimonials),
 * enrollments + lesson completions (→ stats). Idempotent: safe to re-run.
 *
 * Run: npx tsx --env-file=.env.local scripts/seed-free-academy.ts
 * Guard: refuses to run against a non-local Supabase URL.
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!url || !serviceKey) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
if (!/127\.0\.0\.1|localhost/.test(url)) {
  throw new Error(`Refusing to seed: ${url} is not a local Supabase URL. This script is local-only.`)
}

const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

const TENANT_ID = '00000000-0000-0000-0000-000000000010'
const PASSWORD = 'password123'

type Person = { email: string; name: string; role: 'admin' | 'teacher' | 'student'; bio?: string; avatar?: string }

const PEOPLE: Person[] = [
  { email: 'admin@freeacademy.com', name: 'Ana Admin', role: 'admin' },
  { email: 'teacher@freeacademy.com', name: 'Tomás Teacher', role: 'teacher', bio: 'Freelance designer turned educator. 10+ years shipping for clients worldwide.', avatar: 'https://i.pravatar.cc/200?img=12' },
  { email: 'student@freeacademy.com', name: 'Sam Student', role: 'student' },
  { email: 'maria@freeacademy.com', name: 'María Gómez', role: 'student' },
  { email: 'james@freeacademy.com', name: 'James Lee', role: 'student' },
  { email: 'priya@freeacademy.com', name: 'Priya Nair', role: 'student' },
]

async function findUserByEmail(email: string): Promise<string | null> {
  // listUsers is paginated; scan a few pages (local dev has few users).
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (hit) return hit.id
    if (data.users.length < 200) break
  }
  return null
}

async function ensureUser(p: Person): Promise<string> {
  let id = await findUserByEmail(p.email)
  if (!id) {
    const { data, error } = await db.auth.admin.createUser({
      email: p.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: p.name },
    })
    if (error) throw new Error(`createUser ${p.email}: ${error.message}`)
    id = data.user.id
    console.log(`  + auth user ${p.email}`)
  } else {
    console.log(`  = auth user ${p.email} (exists)`)
  }
  // The handle_new_user trigger creates the profile row; make sure names/avatar/bio are set.
  await db.from('profiles').update({ full_name: p.name, avatar_url: p.avatar ?? null, bio: p.bio ?? null }).eq('id', id)
  // Tenant membership.
  const { data: existing } = await db.from('tenant_users').select('id').eq('tenant_id', TENANT_ID).eq('user_id', id).maybeSingle()
  if (!existing) {
    const { error } = await db.from('tenant_users').insert({ tenant_id: TENANT_ID, user_id: id, role: p.role, status: 'active' })
    if (error) throw new Error(`tenant_users ${p.email}: ${error.message}`)
  }
  return id
}

async function ensureCourse(opts: { title: string; description: string; authorId: string; thumbnail: string }): Promise<number> {
  const { data: existing } = await db.from('courses').select('course_id').eq('tenant_id', TENANT_ID).eq('title', opts.title).maybeSingle()
  if (existing) return existing.course_id as number
  const { data, error } = await db
    .from('courses')
    .insert({
      title: opts.title,
      description: opts.description,
      thumbnail_url: opts.thumbnail,
      status: 'published',
      published_at: '2026-01-01T00:00:00Z',
      author_id: opts.authorId,
      tenant_id: TENANT_ID,
      require_sequential_completion: false,
    })
    .select('course_id')
    .single()
  if (error) throw new Error(`course ${opts.title}: ${error.message}`)
  console.log(`  + course "${opts.title}" (#${data.course_id})`)
  return data.course_id as number
}

async function ensureLessons(courseId: number, titles: string[]) {
  const { data: existing } = await db.from('lessons').select('id').eq('course_id', courseId).limit(1)
  if (existing?.length) return
  const rows = titles.map((title, i) => ({
    course_id: courseId,
    tenant_id: TENANT_ID,
    title,
    sequence: i + 1,
    status: 'published',
    content: `<p>${title}. Welcome to this lesson — let's get started.</p>`,
    description: title,
  }))
  const { data, error } = await db.from('lessons').insert(rows).select('id')
  if (error) throw new Error(`lessons #${courseId}: ${error.message}`)
  console.log(`  + ${data.length} lessons for course #${courseId}`)
}

async function ensurePlan(name: string, price: number, days: number, features: string[]) {
  const { data: existing } = await db.from('plans').select('plan_id').eq('tenant_id', TENANT_ID).eq('plan_name', name).is('deleted_at', null).maybeSingle()
  if (existing) return
  const { error } = await db.from('plans').insert({
    plan_name: name,
    price,
    duration_in_days: days,
    currency: 'usd',
    features: features.join('\n'),
    description: `${name} plan`,
    tenant_id: TENANT_ID,
  })
  if (error) throw new Error(`plan ${name}: ${error.message}`)
  console.log(`  + plan ${name} ($${price})`)
}

async function ensureReview(userId: string, courseId: number, rating: number, text: string) {
  const { data: existing } = await db.from('reviews').select('review_id').eq('user_id', userId).eq('entity_type', 'courses').eq('entity_id', courseId).maybeSingle()
  if (existing) return
  const { error } = await db.from('reviews').insert({ user_id: userId, entity_type: 'courses', entity_id: courseId, rating, review_text: text })
  if (error) throw new Error(`review u=${userId} c=${courseId}: ${error.message}`)
}

async function ensureEnrollment(userId: string, courseId: number) {
  const { data: existing } = await db.from('enrollments').select('enrollment_id').eq('user_id', userId).eq('course_id', courseId).maybeSingle()
  if (existing) return
  const { error } = await db.from('enrollments').insert({ user_id: userId, course_id: courseId, status: 'active', tenant_id: TENANT_ID })
  if (error) throw new Error(`enrollment u=${userId} c=${courseId}: ${error.message}`)
}

async function ensureLessonCompletions(userId: string, courseId: number) {
  const { data: lessons } = await db.from('lessons').select('id').eq('course_id', courseId)
  for (const l of lessons ?? []) {
    const { data: existing } = await db.from('lesson_completions').select('id').eq('user_id', userId).eq('lesson_id', l.id).maybeSingle()
    if (!existing) await db.from('lesson_completions').insert({ user_id: userId, lesson_id: l.id })
  }
}

async function main() {
  console.log('Seeding Free Academy →', url)

  // 1) Tenant (paid plan unlocks the landing builder).
  const { error: tErr } = await db.from('tenants').upsert(
    { id: TENANT_ID, slug: 'free-academy', name: 'Free Academy', plan: 'pro', status: 'active', primary_color: '#7c3aed' },
    { onConflict: 'id' }
  )
  if (tErr) throw new Error(`tenant: ${tErr.message}`)
  console.log('  = tenant Free Academy (free-academy)')

  // 2) People.
  const ids: Record<string, string> = {}
  for (const p of PEOPLE) ids[p.email] = await ensureUser(p)
  const teacherId = ids['teacher@freeacademy.com']

  // 3) Courses — one FREE (no product), one paid-looking (still no product locally; label only).
  const freeCourse = await ensureCourse({
    title: 'Intro to Freelancing',
    description: 'A free, beginner-friendly course to land your first freelance client — pricing, portfolio, and outreach.',
    authorId: teacherId,
    thumbnail: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=800&q=80',
  })
  const secondCourse = await ensureCourse({
    title: 'Design Systems Fundamentals',
    description: 'Build and maintain a scalable design system from tokens to components.',
    authorId: teacherId,
    thumbnail: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=800&q=80',
  })

  await ensureLessons(freeCourse, ['Why freelancing', 'Setting your rates', 'Finding your first client', 'Delivering great work'])
  await ensureLessons(secondCourse, ['Design tokens', 'Component APIs', 'Documentation'])

  // 4) Plans.
  await ensurePlan('Free', 0, 3650, ['Access to all free courses', 'Community support', 'Course certificates'])
  await ensurePlan('Pro', 19, 30, ['Everything in Free', 'All premium courses', 'Priority support', '1:1 mentor session'])
  await ensurePlan('Team', 49, 30, ['Everything in Pro', 'Up to 10 seats', 'Team analytics', 'Dedicated success manager'])

  // 5) Reviews (→ testimonials) on the free course.
  await ensureReview(ids['maria@freeacademy.com'], freeCourse, 5, 'This course got me my first paying client within two weeks. Clear, practical, no fluff.')
  await ensureReview(ids['james@freeacademy.com'], freeCourse, 5, 'Loved the pricing module — I finally stopped undercharging. Highly recommend.')
  await ensureReview(ids['priya@freeacademy.com'], freeCourse, 4, 'Great starting point for anyone nervous about going freelance. The outreach templates are gold.')
  await ensureReview(ids['maria@freeacademy.com'], secondCourse, 5, 'Best explanation of design tokens I have seen. Immediately useful at work.')

  // 6) Enrollments + completions (→ stats).
  for (const email of ['student@freeacademy.com', 'maria@freeacademy.com', 'james@freeacademy.com', 'priya@freeacademy.com']) {
    await ensureEnrollment(ids[email], freeCourse)
  }
  await ensureEnrollment(ids['maria@freeacademy.com'], secondCourse)
  await ensureLessonCompletions(ids['maria@freeacademy.com'], freeCourse)
  await ensureLessonCompletions(ids['james@freeacademy.com'], freeCourse)

  console.log('\n✅ Free Academy seeded.')
  console.log('   Tenant:  free-academy.lvh.me:3000 (or :3005)')
  console.log('   Admin:   admin@freeacademy.com / password123')
  console.log('   Student: student@freeacademy.com / password123')
  console.log('   Free course id:', freeCourse)
}

main().catch((e) => {
  console.error('❌ seed failed:', e.message)
  process.exit(1)
})
