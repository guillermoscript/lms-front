import { notFound } from 'next/navigation'

/**
 * Target of the proxy's real-404 rewrite for dead `/reto/*` links
 * (`lib/challenges/proxy-guard.ts`): renders `app/[locale]/not-found.tsx`.
 */
export default function ChallengeNotFound() {
  notFound()
}
