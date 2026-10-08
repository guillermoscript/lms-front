/**
 * POST /api/landing/chat end to end with the real AI SDK and a MockLanguageModelV4 (critique
 * B2/H): the model streams an add_block call as tool-input-start/delta/end, and the response
 * carries transient `data-page-op` parts in order — the provisional add precedes the final
 * update and the tool output. Refusals (no key, non-admin, bad body, big page, other
 * school's session) happen before the usage counter moves.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MockLanguageModelV4 } from 'ai/test'
import { simulateReadableStream } from 'ai'

const T = 'tenant-1'

const state = vi.hoisted(() => ({
  role: 'admin' as string | null,
  plan: 'pro',
  jwtTenant: 'tenant-1',
  resolveError: null as unknown,
  model: null as unknown,
  order: [] as string[],
  usageCalls: 0,
  page: { pageId: 'p1', title: 'Home', slug: 'home', isPublished: false, puckData: null, updatedAt: null } as unknown,
}))

const token = (tenant: string) => `x.${Buffer.from(JSON.stringify({ tenant_id: tenant })).toString('base64url')}.y`

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/api-auth', () => ({
  getApiAuthContext: async () => ({
    user: { id: 'user-1' },
    tenantId: 'tenant-1',
    supabase: { auth: { getSession: async () => ({ data: { session: { access_token: token(state.jwtTenant) } } }) } },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        maybeSingle: async () => ({ data: state.role ? { role: state.role } : null }),
      }
      return b
    },
  }),
}))
vi.mock('@/lib/plans/server', () => ({ getTenantPlan: async () => ({ slug: state.plan, name: null, features: {} }) }))
vi.mock('@/lib/rate-limit', () => ({
  AI_CHAT_TURNS_PER_MINUTE: 20,
  aiChatLimiter: { check: async () => { state.order.push('limiter') } },
}))
vi.mock('@/lib/ai/chat-usage', () => ({
  checkAiChatUsage: async () => {
    state.order.push('usage')
    state.usageCalls++
    return { allowed: true }
  },
  aiChatRateLimitedResponse: () => new Response('', { status: 429 }),
  aiChatUsageLimitResponse: () => new Response('', { status: 429 }),
}))
vi.mock('@/lib/ai/tenant-ai', () => ({
  createTenantAi: () => ({
    lastProviderId: () => 'openai',
    getModelForFeature: async (feature: string, options: { require?: string[] }) => {
      state.order.push(`resolve:${feature}:${(options?.require ?? []).join(',')}`)
      if (state.resolveError) throw state.resolveError
      return { model: state.model, providerId: 'openai', modelId: 'gpt-test' }
    },
  }),
}))
vi.mock('@langfuse/tracing', () => ({ propagateAttributes: (_a: unknown, fn: () => unknown) => fn() }))
vi.mock('@/lib/puck/utils/landing-data', () => ({}))
vi.mock('@/lib/page-builder/context', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/page-builder/context')>()
  return {
    ...orig,
    loadLandingPage: async () => {
      state.order.push('page')
      return state.page
    },
    loadPageBuilderContext: async (tenantId: string, locale: 'en' | 'es') => ({
      tenantId,
      locale,
      school: {
        name: 'Acme', logoUrl: null, locale, theme: null,
        stats: { students: 0, courses: 1, completions: 0 }, testimonialCount: 0, teacherCount: 0,
      },
      courses: [{ id: '7', title: 'Web', description: null, image: null, price: 10, currency: 'usd', status: 'published' }],
      products: [],
      plans: [],
      refs: { course: ['7'], product: [], plan: [] },
    }),
  }
})

import { POST } from '@/app/api/landing/chat/route'
import { AiNotConfiguredError } from '@/lib/ai/errors'
import { pageOpSchema } from '@lms/core'
import { parseThemePreview, recentMessages } from '@/components/admin/landing-page/page-architect/use-page-architect'

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
}

/** Step 1: a streamed add_block call. Step 2: a short reply. */
function streamingModel() {
  const input = '{"type":"HeroBlock","props":{"title":"Learn to code","subtitle":"Fast"}}'
  const deltas = ['{"type":"Hero', 'Block","props":{"title":"Learn', ' to code","subtitle":"Fa', 'st"}}']
  return new MockLanguageModelV4({
    doStream: [
      {
        stream: simulateReadableStream({
          chunks: [
            { type: 'stream-start', warnings: [] },
            { type: 'tool-input-start', id: 'call-1', toolName: 'add_block' },
            ...deltas.map((delta) => ({ type: 'tool-input-delta' as const, id: 'call-1', delta })),
            { type: 'tool-input-end', id: 'call-1' },
            { type: 'tool-call', toolCallId: 'call-1', toolName: 'add_block', input },
            { type: 'finish', usage, finishReason: { unified: 'tool-calls', raw: 'tool_calls' } },
          ],
        }),
      },
      {
        stream: simulateReadableStream({
          chunks: [
            { type: 'stream-start', warnings: [] },
            { type: 'text-start', id: 't1' },
            { type: 'text-delta', id: 't1', delta: 'Added a hero.' },
            { type: 'text-end', id: 't1' },
            { type: 'finish', usage, finishReason: { unified: 'stop', raw: 'stop' } },
          ],
        }),
      },
    ] as never,
  })
}

const body = (over: Record<string, unknown> = {}) => ({
  chatId: 'p1',
  pageId: 'p1',
  locale: 'en',
  pageData: { root: { props: {} }, content: [], zones: {} },
  messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Add a hero about coding' }] }],
  ...over,
})

const post = (b: unknown) =>
  POST(new Request('http://school.lvh.me/api/landing/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(b),
  }))

async function sseChunks(res: Response): Promise<Array<Record<string, unknown>>> {
  const text = await res.text()
  return text
    .split('\n')
    .filter((l) => l.startsWith('data: ') && l !== 'data: [DONE]')
    .map((l) => JSON.parse(l.slice(6)))
}

beforeEach(() => {
  state.role = 'admin'
  state.plan = 'pro'
  state.jwtTenant = T
  state.resolveError = null
  state.model = streamingModel()
  state.order = []
  state.usageCalls = 0
  state.page = { pageId: 'p1', title: 'Home', slug: 'home', isPublished: false, puckData: null, updatedAt: null }
})

describe('POST /api/landing/chat', () => {
  it('streams data-page-op parts: the provisional add precedes the final update and the tool output', async () => {
    const res = await post(body())
    expect(res.status).toBe(200)
    const chunks = await sseChunks(res)
    const types = chunks.map((c) => c.type)

    const opChunks = chunks.filter((c) => c.type === 'data-page-op')
    expect(opChunks.length).toBeGreaterThanOrEqual(2)
    expect(opChunks.every((c) => c.transient === true)).toBe(true)
    const ops = opChunks.map((c) => c.data as Record<string, unknown>)

    const addAt = ops.findIndex((o) => o.op === 'add')
    expect(ops[addAt]).toMatchObject({ op: 'add', type: 'HeroBlock', props: { title: 'Learn' } })
    const id = ops[addAt].id as string
    expect(id).toMatch(/^HeroBlock-/)
    const final = ops[ops.length - 1]
    expect(final).toEqual({ op: 'update', id, props: { title: 'Learn to code', subtitle: 'Fast' } })
    expect(addAt).toBeLessThan(ops.length - 1)
    // Text streamed as an append before the input was complete.
    expect(ops).toContainEqual({ op: 'update', id, appends: { title: ' to code' } })

    // The provisional add went out before the tool input was available; the final op before the output.
    const firstAdd = chunks.findIndex((c) => c.type === 'data-page-op' && (c.data as { op: string }).op === 'add')
    const lastOp = chunks.lastIndexOf(opChunks[opChunks.length - 1])
    expect(firstAdd).toBeLessThan(types.indexOf('tool-input-available'))
    expect(lastOp).toBeLessThan(types.indexOf('tool-output-available'))
    expect(chunks.find((c) => c.type === 'tool-output-available')).toMatchObject({ output: { ok: true, id } })
    expect(types).toContain('text-delta')

    // Check order: model resolved (tools required) → limiter → page → usage last.
    expect(state.order).toEqual(['resolve:landing_builder:tools', 'limiter', 'page', 'usage'])
  })

  it('a turn resumed after an approval continues the same assistant message (its id is reused)', async () => {
    const res = await post(
      body({
        messages: [
          { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Add a hero about coding' }] },
          { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'On it.' }] },
        ],
      })
    )
    const chunks = await sseChunks(res)
    expect(chunks[0]).toMatchObject({ type: 'start', messageId: 'a1' })
  })

  it('a new turn (last message from the user) starts a new assistant message', async () => {
    const chunks = await sseChunks(await post(body()))
    expect(chunks[0].type).toBe('start')
    expect(chunks[0].messageId).not.toBe('m1')
  })

  it('sends the tools and both system messages to the model, with parallel tool calls off', async () => {
    const model = state.model as MockLanguageModelV4
    await (await post(body({ selectedId: 'x' }))).text()
    const call = model.doStreamCalls[0]
    const names = (call.tools ?? []).map((t) => t.name)
    expect(names).toEqual(expect.arrayContaining(['add_block', 'update_block', 'apply_template', 'get_page', 'list_courses', 'preview_theme']))
    const system = call.prompt.filter((m) => m.role === 'system')
    expect(system).toHaveLength(2)
    expect(String(system[0].content)).toContain('Page Architect')
    expect(String(system[1].content)).toContain('<tenant_data>')
    expect(call.providerOptions).toMatchObject({
      openai: { parallelToolCalls: false },
      anthropic: { disableParallelToolUse: true },
      groq: { parallelToolCalls: false },
      mistral: { parallelToolCalls: false },
      xai: { parallelToolCalls: false },
    })
  })

  it('402s a school without a key: no limiter, no page read, no usage increment', async () => {
    state.resolveError = new AiNotConfiguredError('no_key')
    const res = await post(body())
    expect(res.status).toBe(402)
    expect((await res.json()).error).toMatchObject({ code: 'ai_not_configured', feature: 'landing_builder', canConfigure: true })
    expect(state.usageCalls).toBe(0)
    expect(state.order).toEqual(['resolve:landing_builder:tools'])
  })

  it('403s a non-admin before the AI layer', async () => {
    state.role = 'teacher'
    const res = await post(body())
    expect(res.status).toBe(403)
    expect(state.order).toEqual([])
  })

  it('keeps the paid-plan gate', async () => {
    state.plan = 'free'
    const res = await post(body())
    expect(res.status).toBe(403)
    expect(state.usageCalls).toBe(0)
  })

  it('refuses a bad body (400), an oversized page (413), another school\'s session (409) and a foreign page (404) without counting usage', async () => {
    expect((await post({ messages: 'nope' })).status).toBe(400)
    expect((await post(body({ pageData: { content: 'x' } }))).status).toBe(400)
    const huge = { root: { props: {} }, content: [{ type: 'TextBlock', props: { id: 'a', content: 'x'.repeat(600 * 1024) } }], zones: {} }
    expect((await post(body({ pageData: huge }))).status).toBe(413)
    state.jwtTenant = 'tenant-2'
    expect((await post(body())).status).toBe(409)
    state.jwtTenant = T
    state.page = null
    expect((await post(body())).status).toBe(404)
    expect(state.usageCalls).toBe(0)
  })

  it('every streamed op parses with the client schema the editor applies (route ↔ panel contract)', async () => {
    const chunks = await sseChunks(await post(body()))
    const ops = chunks.filter((c) => c.type === 'data-page-op')
    expect(ops.length).toBeGreaterThan(0)
    for (const c of ops) expect(pageOpSchema.safeParse(c.data).success).toBe(true)
  })

  it('streams a theme preview the panel can render', async () => {
    state.model = new MockLanguageModelV4({
      doStream: [
        {
          stream: simulateReadableStream({
            chunks: [
              { type: 'stream-start', warnings: [] },
              { type: 'tool-call', toolCallId: 'c1', toolName: 'preview_theme', input: '{"preset":"estructura","primary":"#3a50b8"}' },
              { type: 'finish', usage, finishReason: { unified: 'tool-calls', raw: 'tool_calls' } },
            ],
          }),
        },
        {
          stream: simulateReadableStream({
            chunks: [
              { type: 'stream-start', warnings: [] },
              { type: 'finish', usage, finishReason: { unified: 'stop', raw: 'stop' } },
            ],
          }),
        },
      ] as never,
    })
    const chunks = await sseChunks(await post(body()))
    const preview = chunks.find((c) => c.type === 'data-theme-preview')
    expect(preview).toMatchObject({ transient: true })
    expect(parseThemePreview(preview?.data)).toEqual({ preset: 'estructura', primary: '#3A50B8' })
  })

  it('three parallel remove_block calls in one step: the third needs approval (approval tallies before any execute)', async () => {
    const page = {
      root: { props: {} },
      content: [
        { type: 'TextBlock', props: { id: 'a', content: 'A' } },
        { type: 'TextBlock', props: { id: 'b', content: 'B' } },
        { type: 'TextBlock', props: { id: 'c', content: 'C' } },
      ],
      zones: {},
    }
    state.model = new MockLanguageModelV4({
      doStream: [
        {
          stream: simulateReadableStream({
            chunks: [
              { type: 'stream-start', warnings: [] },
              ...['a', 'b', 'c'].map((id) => ({ type: 'tool-call' as const, toolCallId: `r-${id}`, toolName: 'remove_block', input: JSON.stringify({ id }) })),
              { type: 'finish', usage, finishReason: { unified: 'tool-calls', raw: 'tool_calls' } },
            ],
          }),
        },
      ] as never,
    })
    const chunks = await sseChunks(await post(body({ pageData: page })))
    const approvals = chunks.filter((c) => c.type === 'tool-approval-request')
    expect(approvals.map((c) => c.toolCallId)).toEqual(['r-c'])
    const removed = chunks.filter((c) => c.type === 'data-page-op').map((c) => (c.data as { id: string }).id)
    expect(removed).toEqual(['a', 'b'])
  })

  it('an add_block call the SDK rejects as invalid leaves no provisional block behind', async () => {
    // "index":"0" parses for streaming but fails the tool schema, so execute never runs.
    const input = '{"type":"HeroBlock","index":"0","props":{"title":"Hi there"}}'
    state.model = new MockLanguageModelV4({
      doStream: [
        {
          stream: simulateReadableStream({
            chunks: [
              { type: 'stream-start', warnings: [] },
              { type: 'tool-input-start', id: 'bad-1', toolName: 'add_block' },
              { type: 'tool-input-delta', id: 'bad-1', delta: '{"type":"HeroBlock","index":"0","props":{"title":"Hi' },
              { type: 'tool-input-delta', id: 'bad-1', delta: ' there"}}' },
              { type: 'tool-input-end', id: 'bad-1' },
              { type: 'tool-call', toolCallId: 'bad-1', toolName: 'add_block', input },
              { type: 'finish', usage, finishReason: { unified: 'tool-calls', raw: 'tool_calls' } },
            ],
          }),
        },
        {
          stream: simulateReadableStream({
            chunks: [
              { type: 'stream-start', warnings: [] },
              { type: 'finish', usage, finishReason: { unified: 'stop', raw: 'stop' } },
            ],
          }),
        },
      ] as never,
    })
    const chunks = await sseChunks(await post(body()))
    const ops = chunks.filter((c) => c.type === 'data-page-op').map((c) => c.data as { op: string; id: string })
    const add = ops.find((o) => o.op === 'add')
    expect(add).toBeTruthy()
    expect(ops.at(-1)).toEqual({ op: 'remove', id: add!.id })
  })

  it('drops a tool call left without output from the history instead of failing the next request', async () => {
    const messages = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'add a hero' }] },
      {
        id: 'a1',
        role: 'assistant',
        parts: [{ type: 'tool-add_block', toolCallId: 'x1', state: 'input-available', input: { type: 'HeroBlock', props: {} } }],
      },
      { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'try again' }] },
    ]
    const model = state.model as MockLanguageModelV4
    const res = await post(body({ messages }))
    expect(res.status).toBe(200)
    await res.text()
    const prompt = model.doStreamCalls[0].prompt
    const toolParts = prompt
      .flatMap((m) => (Array.isArray(m.content) ? (m.content as Array<{ type: string }>) : []))
      .filter((p) => p.type === 'tool-call')
    expect(toolParts).toEqual([])
  })

  it('a capped history starts at a user message, on the client and on the server', async () => {
    const turn = (i: number) => [
      { id: `u${i}`, role: 'user', parts: [{ type: 'text', text: `ask ${i}` }] },
      { id: `a${i}`, role: 'assistant', parts: [{ type: 'text', text: `done ${i}` }] },
    ]
    // 21 messages: a plain cut of the last 20 would open with an assistant message.
    const messages = [...Array.from({ length: 10 }, (_, i) => turn(i)).flat(), { id: 'u10', role: 'user', parts: [{ type: 'text', text: 'last' }] }]
    expect(recentMessages(messages)[0].role).toBe('user')
    expect(recentMessages(messages).at(-1)?.id).toBe('u10')

    const model = state.model as MockLanguageModelV4
    await (await post(body({ messages }))).text()
    const prompt = model.doStreamCalls[0].prompt.filter((m) => m.role !== 'system')
    expect(prompt[0].role).toBe('user')
  })
})
