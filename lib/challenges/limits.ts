// STUB: replaced by WS7 (#1032)
export type ChallengeLimitStatus = { status: 'ok' } | { status: 'rate_limited' } | { status: 'paused' }

export async function checkChallengeLimits(_input: {
  tenantId: string
  exerciseId: number
  ipHash: string
  guestTokenHash: string | null
}): Promise<ChallengeLimitStatus> {
  return { status: 'ok' }
}
