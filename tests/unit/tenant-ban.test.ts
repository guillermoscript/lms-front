/**
 * Tenant bans (#892): the error mapping, the reason normaliser, and the
 * contract of the migration that enforces the ban at the row. The behavioural
 * proof lives in tests/playwright/tenant-ban.spec.ts (real DB, real trigger).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  isTenantBannedError,
  MAX_BAN_REASON_LENGTH,
  normalizeBanReason,
} from '@/lib/tenant/ban'

describe('isTenantBannedError', () => {
  it('matches the SQLSTATE and the bare message, nothing else', () => {
    expect(isTenantBannedError({ code: 'LM002', message: 'whatever' })).toBe(true)
    expect(isTenantBannedError(new Error('tenant_banned'))).toBe(true)
    expect(isTenantBannedError({ code: 'LM001', message: 'plan_limit_exceeded:students' })).toBe(false)
    expect(isTenantBannedError(null)).toBe(false)
    expect(isTenantBannedError('tenant_banned')).toBe(false)
  })
})

describe('normalizeBanReason', () => {
  it('trims, nulls the empty, and caps the length', () => {
    expect(normalizeBanReason('  spam  ')).toBe('spam')
    expect(normalizeBanReason('   ')).toBeNull()
    expect(normalizeBanReason(undefined)).toBeNull()
    expect(normalizeBanReason('x'.repeat(MAX_BAN_REASON_LENGTH + 50))).toHaveLength(MAX_BAN_REASON_LENGTH)
  })
})

describe('tenant ban migration contract', () => {
  const sql = readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20261001160000_tenant_ban_892.sql'),
    'utf8'
  )

  it('ties status = banned to banned_at', () => {
    expect(sql).toMatch(/CHECK \(\(status = 'banned'\) = \(banned_at IS NOT NULL\)\)/)
  })

  it('guards every exit from banned except lift_tenant_ban', () => {
    expect(sql).toMatch(/CREATE TRIGGER guard_tenant_ban\s+BEFORE UPDATE ON public\.tenant_users/)
    expect(sql).toMatch(/OLD\.status = 'banned'/)
    expect(sql).toMatch(/app\.lifting_tenant_ban/)
    expect(sql).toMatch(/ERRCODE = 'LM002'/)
  })

  it('lifts to removed, never straight to active (a ban never spends a seat)', () => {
    const lift = sql.slice(sql.indexOf('FUNCTION public.lift_tenant_ban'))
    expect(lift).toMatch(/SET status\s+= 'removed'/)
    expect(lift).not.toMatch(/SET status\s+= 'active'/)
  })

  it('keeps both RPCs service_role-only', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.ban_tenant_member\(uuid, uuid, uuid, text\) FROM PUBLIC, anon, authenticated/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.lift_tenant_ban\(uuid, uuid\) FROM PUBLIC, anon, authenticated/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.ban_tenant_member\(uuid, uuid, uuid, text\) TO service_role/)
  })
})

describe('ban enforcement sits on every join path', () => {
  const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8')

  it('joinSchool (web action, checkout, native switch, invitation accept) refuses banned first', () => {
    const src = read('lib/tenant/join-school.ts')
    expect(src.indexOf("status === 'banned'")).toBeGreaterThan(-1)
    // before the seat pre-check and before the invitation is consumed
    expect(src.indexOf("status === 'banned'")).toBeLessThan(src.indexOf('getTenantPlanLimits(admin'))
    expect(src.indexOf("status === 'banned'")).toBeLessThan(src.indexOf("update({ status: 'accepted'"))
  })

  it('proxy and the join page treat banned as a dead end, not a redirect loop', () => {
    expect(read('proxy.ts')).toMatch(/eq\('status', 'banned'\)/)
    expect(read('app/[locale]/join-school/page.tsx')).toMatch(/join-school-banned/)
  })
})
