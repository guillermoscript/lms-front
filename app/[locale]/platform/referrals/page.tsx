import { redirect } from 'next/navigation'

// The referral program is not built yet — the `referral_codes` /
// `referral_redemptions` tables don't exist, so the page rendered empty and the
// "Generate Code" form would 500 on submit. Hidden (nav item removed + this
// redirect) until the backing schema lands. The original implementation is in
// git history. Tracking issue: build the referral schema + RPCs, then restore.
export default async function PlatformReferralsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  redirect(`/${locale}/platform`)
}
