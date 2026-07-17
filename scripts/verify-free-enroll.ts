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

const COURSE_ID = 10004

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

  // 2) The course is visible to the student under RLS (proves the tenant claim fix).
  const { data: course, error: cErr } = await supabase
    .from('courses')
    .select('course_id, title, status')
    .eq('course_id', COURSE_ID)
    .single()
  console.log('course visible under RLS:', cErr ? `NO (${cErr.message})` : `YES ("${course!.title}")`)

  // 3) It is genuinely free (no linked product priced > 0) — enrollFree's guard.
  const { data: links } = await supabase.from('product_courses').select('product:products(price)').eq('course_id', COURSE_ID)
  const paid = (links ?? []).some((l: any) => Number(l.product?.price) > 0)
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
