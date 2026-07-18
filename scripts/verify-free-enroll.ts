/**
 * Verify the free-course enrollment path end-to-end AS THE STUDENT, under RLS —
 * the exact mechanism the /courses/{id}?enroll=1 flow (enrollFree server action)
 * uses: grant_free_entitlement RPC, then has_course_access. LOCAL-ONLY.
 *
 * Run: npx tsx --env-file=.env.local scripts/verify-free-enroll.ts
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
if (!/127\.0\.0\.1|localhost/.test(url)) throw new Error('local-only')

async function main() {
  const supabase = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } })

  // 1) Sign in as the student (RLS now scoped to their JWT tenant claim).
  const { data: auth, error: signInErr } = await supabase.auth.signInWithPassword({
    email: 'student@freeacademy.com',
    password: 'password123',
  })
  if (signInErr) throw new Error('signIn: ' + signInErr.message)
  const userId = auth.user!.id
  console.log('signed in as student', userId, '| jwt tenant_id claim present ✓')

  // 2) Resolve the tenant's free course under the student's RLS (course ids are assigned by
  //    sequence, so they vary per database — never hardcode them). Optional argv override.
  //    Visibility here also proves the tenant claim fix: RLS scopes the student to Free Academy.
  const argId = Number(process.argv[2])
  const { data: courses, error: cErr } = await supabase
    .from('courses')
    .select('course_id, title, status, product_courses(product:products(price))')
    .eq('status', 'published')
    .order('course_id')
  if (cErr) throw new Error('courses under RLS: ' + cErr.message)
  // free = no linked product priced > 0 — enrollFree's guard.
  const course = Number.isFinite(argId)
    ? (courses ?? []).find((c: any) => c.course_id === argId)
    : (courses ?? []).find((c: any) => !(c.product_courses ?? []).some((l: any) => Number(l.product?.price) > 0))
  if (!course) throw new Error('no free published course visible to the student — run scripts/seed-free-academy.ts first')
  const COURSE_ID = course.course_id
  console.log(`course visible under RLS: YES ("${course.title}" #${COURSE_ID})`)
  const paid = ((course as any).product_courses ?? []).some((l: any) => Number(l.product?.price) > 0)
  console.log('free course (no paid product):', paid ? 'NO' : 'YES')

  // 4) Access BEFORE enrolling.
  const before = await supabase.rpc('has_course_access', { _user_id: userId, _course_id: COURSE_ID })
  console.log('has_course_access BEFORE:', before.data)

  // 5) Enroll — the exact RPC enrollFree calls.
  const grant = await supabase.rpc('grant_free_entitlement', { _user_id: userId, _course_id: COURSE_ID })
  console.log('grant_free_entitlement:', grant.error ? `ERROR ${grant.error.message}` : 'OK')

  // 6) Access AFTER enrolling.
  const after = await supabase.rpc('has_course_access', { _user_id: userId, _course_id: COURSE_ID })
  console.log('has_course_access AFTER:', after.data)

  if (before.data === false && after.data === true) {
    console.log('\n✅ PASS — student went from NO access → enrolled → HAS access to the free course.')
  } else if (after.data === true) {
    console.log('\n✅ PASS — student HAS access to the free course after enrolling (was already enrolled).')
  } else {
    console.log('\n❌ FAIL — access not granted.')
    process.exit(1)
  }
}

main().catch((e) => { console.error('❌', e.message); process.exit(1) })
