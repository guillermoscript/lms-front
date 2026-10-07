import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const T = '11111111-1111-1111-1111-111111111111'
const U = 'user-1'

const m = vi.hoisted(() => ({
  getBearerUser: vi.fn(),
  role: 'teacher' as string | null,
  rpc: vi.fn(),
  getImageModel: vi.fn(),
  generateImage: vi.fn(),
  tenantIdsSeen: [] as string[],
}))

vi.mock('@/lib/supabase/api-auth', () => ({ getBearerUser: m.getBearerUser }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: m.rpc,
    from: () => {
      const b: Record<string, unknown> = {}
      for (const k of ['select', 'eq']) b[k] = () => b
      b.maybeSingle = async () => ({ data: m.role ? { role: m.role } : null, error: null })
      return b
    },
  }),
}))
vi.mock('@/lib/ai/tenant-ai', () => ({
  createTenantAi: (tenantId: string) => {
    m.tenantIdsSeen.push(tenantId)
    return { getImageModel: m.getImageModel, lastProviderId: () => 'openai' }
  },
}))
vi.mock('ai', () => ({ generateImage: (...a: unknown[]) => m.generateImage(...a) }))

const { POST } = await import('@/app/api/internal/ai/image/route')
const { AiNotConfiguredError } = await import('@/lib/ai/errors')

const jwt = (claims: Record<string, unknown>) =>
  `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`

function req(opts: { secret?: string | null; token?: string | null; body?: unknown } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (opts.secret !== null) headers['x-mcp-secret'] = opts.secret ?? 'shh'
  if (opts.token !== null) headers.authorization = `Bearer ${opts.token ?? jwt({ tenant_id: T })}`
  return new Request('http://x/api/internal/ai/image', {
    method: 'POST',
    headers,
    body: JSON.stringify(opts.body ?? { prompt: 'A friendly robot teaching plants' }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  m.tenantIdsSeen.length = 0
  m.role = 'teacher'
  process.env.MCP_PROXY_SECRET = 'shh'
  delete process.env.AI_IMAGE_DAILY_CAP
  m.getBearerUser.mockResolvedValue({ id: U })
  m.getImageModel.mockResolvedValue({ model: { id: 'm' }, providerId: 'openai', modelId: 'gpt-image-1' })
  m.rpc.mockResolvedValue({ data: { allowed: true, used: 1, cap: 20 }, error: null })
  m.generateImage.mockResolvedValue({
    image: { uint8Array: new Uint8Array(100), base64: 'AAAA', mediaType: 'image/webp' },
  })
})

describe('POST /api/internal/ai/image auth', () => {
  it('fails closed when MCP_PROXY_SECRET is unset', async () => {
    delete process.env.MCP_PROXY_SECRET
    expect((await POST(req())).status).toBe(503)
    expect(m.generateImage).not.toHaveBeenCalled()
  })

  it('rejects a missing or wrong secret before touching the token', async () => {
    expect((await POST(req({ secret: null }))).status).toBe(401)
    expect((await POST(req({ secret: 'nope' }))).status).toBe(401)
    expect(m.getBearerUser).not.toHaveBeenCalled()
  })

  it('rejects an unverified bearer token', async () => {
    m.getBearerUser.mockResolvedValue(null)
    expect((await POST(req())).status).toBe(401)
    expect((await POST(req({ token: null }))).status).toBe(401)
  })

  it('needs a tenant claim and a teacher/admin membership', async () => {
    expect((await POST(req({ token: jwt({}) }))).status).toBe(400)
    m.role = 'student'
    expect((await POST(req())).status).toBe(403)
    m.role = null
    expect((await POST(req())).status).toBe(403)
    expect(m.generateImage).not.toHaveBeenCalled()
  })

  it('takes the tenant from the verified token, never the body', async () => {
    await POST(req({ body: { prompt: 'A friendly robot teaching plants', tenantId: 'evil' } }))
    expect(m.tenantIdsSeen).toEqual([T])
  })
})

describe('POST /api/internal/ai/image generation', () => {
  it('returns the image without any key material', async () => {
    const res = await POST(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ image: 'AAAA', mediaType: 'image/webp', provider: 'openai', model: 'gpt-image-1' })
    const opts = m.generateImage.mock.calls[0][0]
    expect(opts.size).toBe('1536x1024')
    expect(opts.providerOptions.openai.outputFormat).toBe('webp')
  })

  it('maps a missing key to 402 and reserves no quota', async () => {
    m.getImageModel.mockRejectedValue(new AiNotConfiguredError('no_key'))
    const res = await POST(req())
    expect(res.status).toBe(402)
    const body = await res.json()
    expect(body.error.code).toBe('ai_not_configured')
    expect(body.error.canConfigure).toBe(false)
    expect(m.rpc).not.toHaveBeenCalled()
    expect(m.generateImage).not.toHaveBeenCalled()
  })

  it('tells an admin where to configure', async () => {
    m.role = 'admin'
    m.getImageModel.mockRejectedValue(new AiNotConfiguredError('no_key'))
    const body = await (await POST(req())).json()
    expect(body.error.canConfigure).toBe(true)
    expect(body.error.settingsUrl).toContain('/dashboard/admin/settings/ai')
  })

  it('refuses over the daily cap with 429 and does not generate', async () => {
    m.rpc.mockResolvedValue({ data: { allowed: false, reason: 'daily_limit', cap: 20 }, error: null })
    const res = await POST(req())
    expect(res.status).toBe(429)
    expect((await res.json()).error).toMatchObject({ code: 'image_rate_limited', reason: 'daily_limit' })
    expect(m.generateImage).not.toHaveBeenCalled()
  })

  it('fails closed when the usage RPC errors', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: 'XX000' } })
    expect((await POST(req())).status).toBe(503)
    expect(m.generateImage).not.toHaveBeenCalled()
  })

  it('passes the configured daily cap to the DB', async () => {
    process.env.AI_IMAGE_DAILY_CAP = '3'
    await POST(req())
    expect(m.rpc).toHaveBeenCalledWith('reserve_ai_image_generation', {
      _tenant_id: T,
      _user_id: U,
      _daily_cap: 3,
      _cooldown_seconds: 5,
    })
  })

  it('releases the slot and returns a typed 502 when the provider fails', async () => {
    m.generateImage.mockRejectedValue(Object.assign(new Error('boom sk-leak'), { name: 'AI_APICallError', statusCode: 500 }))
    const res = await POST(req())
    expect(res.status).toBe(502)
    expect(JSON.stringify(await res.json())).not.toContain('sk-leak')
    expect(m.rpc).toHaveBeenCalledWith('release_ai_image_generation', { _tenant_id: T, _user_id: U })
  })

  it('rejects oversized output and disallowed media types', async () => {
    m.generateImage.mockResolvedValueOnce({
      image: { uint8Array: new Uint8Array(5 * 1024 * 1024 + 1), base64: 'A', mediaType: 'image/webp' },
    })
    expect((await POST(req())).status).toBe(413)
    m.generateImage.mockResolvedValueOnce({
      image: { uint8Array: new Uint8Array(10), base64: 'A', mediaType: 'image/svg+xml' },
    })
    expect((await POST(req())).status).toBe(422)
  })

  it('validates the prompt', async () => {
    expect((await POST(req({ body: { prompt: '' } }))).status).toBe(400)
    expect((await POST(req({ body: { prompt: 'x'.repeat(1001) } }))).status).toBe(400)
  })
})
