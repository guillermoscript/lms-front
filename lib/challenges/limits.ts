// STUB: replaced by WS7 (#1032)
export type ChallengeLimitStatus =
  | { status: 'ok'; official: boolean }
  | { status: 'rate_limited' }
  | { status: 'paused' }

export async function checkChallengeLimits(_input: {
  tenantId: string
  exerciseId: number
  ipHash: string
  guestTokenHash: string | null
  userId?: string | null
}): Promise<ChallengeLimitStatus> {
  return { status: 'ok', official: true }
}
