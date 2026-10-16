import { describe, it, expect, vi, beforeEach } from 'vitest'
import en from '@/messages/en.json'
import es from '@/messages/es.json'

let locale: 'en' | 'es' = 'en'

vi.mock('@/lib/i18n/tenant-locale', () => ({
  resolveTenantLocale: async () => locale,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: async ({ locale: l, namespace }: { locale: 'en' | 'es'; namespace: string }) => {
    const ns = (l === 'es' ? es : en) as unknown as Record<string, Record<string, Record<string, string>>>
    return (key: string, values?: Record<string, string>) => {
      const [k, field] = key.split('.')
      return ns[namespace][k][field].replace('{reason}', values?.reason ?? '')
    }
  },
}))

import { notifyMember } from '@/lib/notifications/member-notice'

const inserts: Array<{ table: string; row: Record<string, unknown> }> = []
let notificationError: unknown = null
let linkError: unknown = null

function makeAdmin() {
  return {
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          inserts.push({ table, row })
          if (table === 'user_notifications') return Promise.resolve({ error: linkError })
          return {
            select: () => ({
              single: async () =>
                notificationError
                  ? { data: null, error: notificationError }
                  : { data: { id: 42 }, error: null },
            }),
          }
        },
      }
    },
  } as never
}

beforeEach(() => {
  inserts.length = 0
  notificationError = null
  linkError = null
  locale = 'en'
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('notifyMember (#961)', () => {
  it('writes a tenant-scoped notification only with real columns, plus the inbox row', async () => {
    const ok = await notifyMember({
      admin: makeAdmin(), tenantId: 't1', userId: 'u1', actorId: 'a1', kind: 'removed', link: '/join-school',
    })
    expect(ok).toBe(true)
    const [n, un] = inserts
    expect(n.table).toBe('notifications')
    expect(Object.keys(n.row).sort()).toEqual(
      ['content', 'created_by', 'metadata', 'notification_type', 'priority', 'sent_at', 'status', 'target_type', 'target_user_ids', 'tenant_id', 'title'].sort()
    )
    expect(n.row.tenant_id).toBe('t1')
    expect(n.row.target_user_ids).toEqual(['u1'])
    expect(n.row.target_type).toBe('user')
    expect(n.row.metadata).toEqual({ link: '/join-school', kind: 'removed' })
    expect(un).toEqual({ table: 'user_notifications', row: { notification_id: 42, user_id: 'u1' } })
  })

  it('uses the school locale and interpolates the deactivation reason', async () => {
    locale = 'es'
    await notifyMember({ admin: makeAdmin(), tenantId: 't1', userId: 'u1', kind: 'deactivated', reason: 'spam' })
    expect(inserts[0].row.content).toBe('Tu cuenta fue desactivada: spam')
  })

  it('does not throw and returns false when the insert fails', async () => {
    notificationError = { message: 'boom' }
    await expect(
      notifyMember({ admin: makeAdmin(), tenantId: 't1', userId: 'u1', kind: 'banned' })
    ).resolves.toBe(false)
    expect(console.error).toHaveBeenCalled()
    expect(inserts.some(i => i.table === 'user_notifications')).toBe(false)
  })

  it('returns false when the inbox row fails', async () => {
    linkError = { message: 'nope' }
    await expect(
      notifyMember({ admin: makeAdmin(), tenantId: 't1', userId: 'u1', kind: 'reactivated' })
    ).resolves.toBe(false)
  })
})
