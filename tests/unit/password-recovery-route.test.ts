import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({
  verifyOtp: vi.fn(), getUser: vi.fn(), tenant: vi.fn(), createClient: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: state.createClient }))
vi.mock('@/lib/supabase/tenant', () => ({ getCurrentTenantId: state.tenant }))
vi.mock('@/lib/analytics/server', () => ({ track: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`) } }))

import { GET } from '@/app/[locale]/auth/confirm/route'
const context = { params: Promise.resolve({ locale: 'es' }) }

beforeEach(() => {
  vi.clearAllMocks()
  state.verifyOtp.mockResolvedValue({ error: null })
  state.createClient.mockResolvedValue({ auth: { verifyOtp: state.verifyOtp, getUser: state.getUser } })
})

describe('password recovery callback', () => {
  it('verifies the token and opens the localized form even if a next param points elsewhere', async () => {
    await expect(GET(new NextRequest('http://school.example.com/es/auth/confirm?token_hash=valid-token&type=recovery&next=/create-school'), context))
      .rejects.toThrow('redirect:/es/auth/update-password')
    expect(state.verifyOtp).toHaveBeenCalledWith({ type: 'recovery', token_hash: 'valid-token' })
    expect(state.tenant).not.toHaveBeenCalled()
    expect(state.getUser).not.toHaveBeenCalled()
  })

  it('returns to the recovery screen with a clear invalid-link state on expired or used tokens', async () => {
    state.verifyOtp.mockResolvedValue({ error: { code: 'otp_expired', message: 'token used' } })
    await expect(GET(new NextRequest('http://school.example.com/es/auth/confirm?token_hash=used-token&type=recovery'), context))
      .rejects.toThrow('redirect:/es/auth/update-password?error=invalid_link')
    expect(state.tenant).not.toHaveBeenCalled()
  })

  it('does not attempt verification when a recovery link has no token', async () => {
    await expect(GET(new NextRequest('http://school.example.com/es/auth/confirm?type=recovery'), context))
      .rejects.toThrow('redirect:/es/auth/update-password?error=invalid_link')
    expect(state.createClient).not.toHaveBeenCalled()
  })
})
