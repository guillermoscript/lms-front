/**
 * Sign a student's own AI chat attachments — `POST /api/chat/attachments/sign`
 *
 * The `ai-chat-attachments` bucket is private and carries no `authenticated`
 * policy, so only the service role can sign its objects. The web never
 * notices: its server pages hydrate history through `signStoredAttachments`.
 * A native client builds history straight from Supabase and is left holding
 * storage paths it cannot open — the images a student sent vanish on reload
 * (#823, guillermoscript/lms-app#13).
 *
 * Ownership needs no table read. `persistUserAttachments` writes every object
 * under `<tenantId>/<userId>/`, so a path outside the caller's own prefix is
 * somebody else's and is dropped before anything is signed.
 *
 * Body `{ paths: string[] }` → `{ urls: { [path]: signedUrl } }`. Keyed by path,
 * not by position: a refused or missing object is simply absent, and the client
 * already holds each path's `mediaType` and `filename` from the message row.
 */

import { NextResponse } from 'next/server'
import { getApiAuthContext } from '@/lib/supabase/api-auth'
import { signAttachmentPaths } from '@/lib/ai/attachments'

export const dynamic = 'force-dynamic'

// A screenful of history at 4 images a message. More is a client bug, not a need.
const MAX_PATHS_PER_REQUEST = 100

export async function POST(request: Request) {
  const auth = await getApiAuthContext(request)
  if (!auth) return new NextResponse('Unauthorized', { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 })
  }

  const paths = (body as { paths?: unknown } | null)?.paths
  if (!Array.isArray(paths) || paths.some((p) => typeof p !== 'string')) {
    return new NextResponse('paths must be an array of strings', { status: 400 })
  }
  if (paths.length > MAX_PATHS_PER_REQUEST) {
    return new NextResponse(`At most ${MAX_PATHS_PER_REQUEST} paths per request`, { status: 400 })
  }

  const ownPrefix = `${auth.tenantId}/${auth.user.id}/`
  const own = [...new Set(paths as string[])].filter(
    (path) => path.startsWith(ownPrefix) && !path.split('/').includes('..')
  )

  const urls = Object.fromEntries(await signAttachmentPaths(own))
  return NextResponse.json({ urls }, { headers: { 'Cache-Control': 'private, no-store' } })
}
