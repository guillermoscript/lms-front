import { getBlockedMembers } from '@/app/actions/community'

export async function GET() {
  const result = await getBlockedMembers()
  return Response.json(result, {
    status: result.success ? 200 : 403,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
