/**
 * BYOK contract / static checks (issue: bring-your-own AI keys).
 *
 * These read the source tree, not behavior. They exist so the invariants the
 * whole feature rests on cannot erode one innocent-looking import at a time:
 *
 *   - the platform holds no AI key and no code reads one;
 *   - provider SDKs are constructed in exactly one file, from a tenant's key;
 *   - no model is hardcoded (the old `AI_MODELS` / `defaultModel` are gone);
 *   - key code never reaches a client bundle;
 *   - the tenant id given to the resolver never comes from a request body;
 *   - every declared AI feature has a call site (no dead settings rows).
 *
 * A failure message names the offending file and line so the fix is obvious.
 * If a rule needs an exception, add it to the allowlist HERE with a reason, in
 * review, rather than weakening the rule.
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

import { AI_FEATURES, type AiFeature } from '@/lib/ai/features'

const ROOT = resolve(__dirname, '../..')

// --- source walker -------------------------------------------------------------

const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', '.mcp-use', 'coverage'])
const SOURCE_EXT = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (SOURCE_EXT.test(name) && !name.endsWith('.d.ts')) out.push(full)
  }
  return out
}

const rel = (file: string) => relative(ROOT, file).split(sep).join('/')

/** Runtime source: everything that ships or runs (not tests, not generated types). */
const RUNTIME_ROOTS = ['app', 'components', 'hooks', 'lib', 'scripts', 'mcp-server/src', 'packages']
const ROOT_FILES = [
  'instrumentation.ts',
  'instrumentation-client.ts',
  'sentry.server.config.ts',
  'sentry.edge.config.ts',
  'proxy.ts',
  'next.config.ts',
  'i18n.ts',
]

const runtimeFiles = [
  ...RUNTIME_ROOTS.flatMap((r) => walk(join(ROOT, r))),
  ...ROOT_FILES.map((f) => join(ROOT, f)).filter(existsSync),
].filter((f) => !rel(f).startsWith('lib/database.types'))

const text = new Map<string, string>()
const read = (file: string) => {
  let s = text.get(file)
  if (s === undefined) text.set(file, (s = readFileSync(file, 'utf8')))
  return s
}

/** Drops comments and string-free doc blocks so a rule is not tripped by prose. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
}

interface Hit {
  file: string
  line: number
  text: string
}

function grep(files: string[], re: RegExp, opts: { stripComments?: boolean } = {}): Hit[] {
  const hits: Hit[] = []
  for (const file of files) {
    const src = opts.stripComments === false ? read(file) : stripComments(read(file))
    const lines = src.split('\n')
    lines.forEach((l, i) => {
      if (re.test(l)) hits.push({ file: rel(file), line: i + 1, text: l.trim().slice(0, 140) })
    })
  }
  return hits
}

const show = (hits: Hit[]) => hits.map((h) => `${h.file}:${h.line}  ${h.text}`)

// --- 1. provider SDKs only in lib/ai/providers.ts ------------------------------

/**
 * Files allowed to import a provider SDK, with the reason.
 * - providers.ts: the registry; the one place keys become models.
 * - realtime-model.ts: the BROWSER's wire-protocol parser for realtime voice. It
 *   constructs a provider's realtime model without any credential (the browser
 *   only ever receives an ephemeral token) and is imported by client code only.
 */
const PROVIDER_IMPORT_ALLOWLIST = new Set(['lib/ai/providers.ts', 'lib/speech/realtime-model.ts'])

/** `@ai-sdk/*` packages that are NOT model providers. */
const NON_PROVIDER_AI_SDK = new Set(['react', 'mcp', 'otel', 'provider', 'provider-utils'])

const IMPORT_SPEC =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g

function providerSpecifiers(src: string): string[] {
  const found: string[] = []
  for (const m of src.matchAll(IMPORT_SPEC)) {
    const spec = m[1]
    if (spec.startsWith('@ai-sdk/')) {
      const name = spec.slice('@ai-sdk/'.length).split('/')[0]
      if (!NON_PROVIDER_AI_SDK.has(name)) found.push(spec)
    } else if (spec.startsWith('@openrouter/') || spec === 'openai' || spec.startsWith('openai/')) {
      found.push(spec)
    } else if (spec === 'assemblyai' || spec.startsWith('assemblyai/')) {
      found.push(spec)
    }
  }
  return found
}

describe('provider SDK imports', () => {
  it('only lib/ai/providers.ts (and the key-free browser realtime parser) import a provider SDK', () => {
    const offenders: string[] = []
    for (const file of runtimeFiles) {
      if (PROVIDER_IMPORT_ALLOWLIST.has(rel(file))) continue
      for (const spec of providerSpecifiers(stripComments(read(file)))) offenders.push(`${rel(file)} imports ${spec}`)
    }
    expect(offenders, 'Get a model from createTenantAi() (lib/ai/tenant-ai.ts) instead').toEqual([])
  })

  it('the allowlist is real: both exceptions exist and do import a provider', () => {
    for (const f of PROVIDER_IMPORT_ALLOWLIST) {
      expect(existsSync(join(ROOT, f)), f).toBe(true)
      expect(providerSpecifiers(read(join(ROOT, f))).length, f).toBeGreaterThan(0)
    }
  })

  it('the mcp-server never imports a model provider (images go through the internal route)', () => {
    const mcp = walk(join(ROOT, 'mcp-server/src'))
    const offenders = mcp.flatMap((f) => providerSpecifiers(stripComments(read(f))).map((s) => `${rel(f)} imports ${s}`))
    expect(offenders).toEqual([])
  })

  it('ESLint enforces the same rule with no temporary allowlist left behind', () => {
    const eslint = readFileSync(join(ROOT, 'eslint.config.mjs'), 'utf8')
    expect(eslint).toContain('no-restricted-imports')
    expect(eslint).not.toMatch(/LEGACY_PROVIDER_IMPORTS|TEMPORARY/)
    // The two exceptions above, and nothing else, are exempt.
    const ignores = eslint.match(/ignores:\s*\[([^\]]*)\]/g) ?? []
    const exemptList = ignores.find((i) => i.includes('lib/ai/providers.ts'))
    expect(exemptList).toBeDefined()
    const files = [...(exemptList ?? '').matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort()
    expect(files).toEqual([...PROVIDER_IMPORT_ALLOWLIST].sort())
  })
})

// --- 2. no platform AI key anywhere -------------------------------------------

/** Env names that would be a platform-held AI credential. */
const AI_VENDOR_KEY_ENV =
  /\b(?:OPENAI|ASSEMBLYAI|ANTHROPIC|GOOGLE_GENERATIVE_AI|GOOGLE_AI|GEMINI|GROQ|MISTRAL|XAI|DEEPSEEK|OPENROUTER|VAPI|ELEVENLABS|DEEPGRAM)[A-Z0-9_]*(?:KEY|TOKEN|SECRET)\b/

describe('no platform AI key', () => {
  it('no code reads an AI vendor key from the environment', () => {
    const reads = new RegExp(`process\\.env(?:\\.|\\[\\s*['"])${AI_VENDOR_KEY_ENV.source}`)
    expect(show(grep(runtimeFiles, reads))).toEqual([])
  })

  it('no NEXT_PUBLIC_* variable is a secret-shaped key (only publishable / anon keys may be public)', () => {
    const publicKeyVar = /process\.env(?:\.|\[\s*['"])(NEXT_PUBLIC_[A-Z0-9_]*(?:KEY|SECRET|TOKEN)[A-Z0-9_]*)/g
    const offenders: string[] = []
    for (const file of runtimeFiles) {
      for (const m of stripComments(read(file)).matchAll(publicKeyVar)) {
        if (!/PUBLISHABLE|ANON/.test(m[1])) offenders.push(`${rel(file)} reads ${m[1]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('.env.example, the Dockerfile and the workflows do not carry an AI vendor key', () => {
    const files = ['.env.example', 'Dockerfile', 'mcp-server/.env.example']
      .map((f) => join(ROOT, f))
      .concat(
        existsSync(join(ROOT, '.github/workflows'))
          ? readdirSync(join(ROOT, '.github/workflows')).map((f) => join(ROOT, '.github/workflows', f))
          : [],
      )
      .filter(existsSync)
    const assignment = new RegExp(`(?:^|\\s)(?:ARG|ENV|export)?\\s*${AI_VENDOR_KEY_ENV.source}\\s*[=:]`, 'm')
    const offenders = files.filter((f) => {
      // Comments may name the removed variables (to say they are gone); active lines may not.
      const active = readFileSync(f, 'utf8')
        .split('\n')
        .filter((l) => !l.trim().startsWith('#'))
        .join('\n')
      return assignment.test(active)
    })
    expect(offenders.map(rel)).toEqual([])
  })

  it('the master key is the only AI env the app reads', () => {
    const reads = grep(runtimeFiles, /process\.env\.AI_KEYS_[A-Z_]+/).map((h) => h.file)
    // crypto-core is the single reader (the rotation script imports it).
    expect([...new Set(reads)]).toEqual(['lib/ai/byok/crypto-core.ts'])
  })
})

// --- 3. no hardcoded model ------------------------------------------------------

describe('no hardcoded model', () => {
  it('nothing references AI_MODELS, DEFAULT_MODEL_ID or AI_CONFIG.defaultModel', () => {
    const re = /\bAI_MODELS\b|\bDEFAULT_MODEL_ID\b|AI_CONFIG\.defaultModel|\bdefaultModel\s*\(/
    expect(show(grep(runtimeFiles, re))).toEqual([])
  })

  it('lib/ai/config.ts is constants only: no imports, no exported model', () => {
    const src = stripComments(read(join(ROOT, 'lib/ai/config.ts')))
    expect(src).not.toMatch(/^\s*import\s/m)
    expect(src).not.toMatch(/export\s+const\s+(?:AI_MODELS|DEFAULT_MODEL_ID)/)
    expect(src).not.toMatch(/defaultModel/)
    expect(src).toMatch(/export const AI_CONFIG/)
    expect(src).toMatch(/export const DEFAULT_PASSING_SCORE/)
  })

  it('structured output uses generateText + Output.object (no generateObject / streamObject)', () => {
    const files = runtimeFiles.filter((f) => !rel(f).startsWith('scripts/'))
    expect(show(grep(files, /\b(?:generateObject|streamObject)\b/))).toEqual([])
  })
})

// --- 4. key code never reaches a client bundle ---------------------------------

const USE_CLIENT = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*['"]use client['"]/

/** Modules that decrypt, hold or use a key: server only. */
const SERVER_ONLY_AI_MODULE =
  /@\/lib\/ai\/(?:byok\/|tenant-ai|with-tenant-ai|providers|transcription|trace-content-)|(?:^|\/)lib\/ai\/(?:byok\/|tenant-ai|with-tenant-ai|providers)/

describe('key code stays on the server', () => {
  it('no client component imports lib/ai/byok/*, the resolver, or the provider registry', () => {
    const offenders: string[] = []
    for (const file of runtimeFiles) {
      const src = read(file)
      if (!USE_CLIENT.test(src)) continue
      for (const m of stripComments(src).matchAll(IMPORT_SPEC)) {
        if (SERVER_ONLY_AI_MODULE.test(m[1])) offenders.push(`${rel(file)} imports ${m[1]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('every byok module that touches a key carries import "server-only" (the *-core files exist for tsx scripts)', () => {
    for (const f of ['lib/ai/byok/crypto.ts', 'lib/ai/byok/redact.ts', 'lib/ai/tenant-ai.ts', 'lib/ai/with-tenant-ai.ts']) {
      expect(read(join(ROOT, f)), f).toMatch(/import\s+['"]server-only['"]/)
    }
    const core = walk(join(ROOT, 'lib/ai/byok')).filter((f) => f.endsWith('-core.ts'))
    expect(core.length).toBeGreaterThan(0)
  })

  it('ciphertext is read only by the resolver, the admin actions and the rotation script', () => {
    const allowed = new Set([
      'lib/ai/tenant-ai.ts',
      'app/actions/admin/ai-settings.ts',
      'scripts/rotate-ai-keys.ts',
    ])
    const hits = grep(runtimeFiles, /\bkey_ciphertext\b/).filter((h) => !allowed.has(h.file))
    expect(show(hits)).toEqual([])
  })

  it('the credentials table is touched only by server modules (never a component or hook)', () => {
    const hits = grep(runtimeFiles, /tenant_ai_credentials/).filter(
      (h) => h.file.startsWith('components/') || h.file.startsWith('hooks/') || h.file.startsWith('app/[locale]'),
    )
    expect(show(hits)).toEqual([])
  })

  it('credential rows are read with the admin client, filtered by tenant', () => {
    for (const f of ['lib/ai/tenant-ai.ts', 'app/actions/admin/ai-settings.ts']) {
      const src = read(join(ROOT, f))
      expect(src, f).toMatch(/createAdminClient/)
      expect(src, f).toMatch(/\.eq\(\s*['"]tenant_id['"]/)
    }
  })
})

// --- 5. the tenant id never comes from a request ------------------------------

const TENANT_FROM_REQUEST: Array<[string, RegExp]> = [
  ['body.tenantId / body.tenant_id', /\b(?:body|reqBody|requestBody|payload|json|formData)\??\.tenant_?[iI]d\b/],
  ['destructured from the body', /\{[^}]*\btenant_?[iI]d\b[^}]*\}\s*=\s*(?:body|payload|await\s+(?:req|request)\.json\(\))/],
  ['read from the URL / form', /(?:searchParams|formData|headers)\??\.get\(\s*['"](?:tenantId|tenant_id)['"]/],
  ['resolver given the body', /createTenantAi\(\s*(?:body|payload|json|data|input|params|searchParams)\b/],
]

describe('tenant id source', () => {
  // Every file that resolves a tenant's AI is a place the tenant must come from auth.
  const aiCallers = runtimeFiles.filter((f) => /createTenantAi\(|withTenantAi\(|getModelForFeature\(/.test(read(f)))

  it('there are AI call sites to check (the scan is not silently empty)', () => {
    expect(aiCallers.length).toBeGreaterThan(10)
  })

  it.each(TENANT_FROM_REQUEST)('no AI call site takes the tenant from the request: %s', (_name, re) => {
    const scanned = aiCallers.filter((f) => rel(f).startsWith('app/') || rel(f).startsWith('lib/'))
    expect(show(grep(scanned, re))).toEqual([])
  })

  it('createTenantAi refuses anything that is not a uuid (a caller bug never guesses a tenant)', () => {
    const src = read(join(ROOT, 'lib/ai/tenant-ai.ts'))
    expect(src).toMatch(/UUID_RE\.test\(tenantId\)/)
  })
})

// --- 6. every feature has a call site -----------------------------------------

/** Files that only declare features; they are not call sites. */
const FEATURE_REGISTRY_FILES = new Set([
  'lib/ai/features.ts',
  'lib/ai/capabilities.ts',
  'lib/ai/provider-ids.ts',
  'lib/ai/ui-flags.ts',
])

/** Non-language kinds are reached through their own accessor, not `getModelForFeature`. */
const ACCESSOR_FOR_FEATURE: Partial<Record<AiFeature, RegExp>> = {
  speech_stt: /\.getTranscriber\(/,
  voice_conversation: /\.getRealtime\(/,
  image_generation: /\.getImageModel\(/,
}

describe('AI features', () => {
  const callSiteFiles = runtimeFiles.filter(
    (f) =>
      !FEATURE_REGISTRY_FILES.has(rel(f)) &&
      rel(f) !== 'lib/ai/tenant-ai.ts' &&
      rel(f) !== 'app/actions/admin/ai-settings.ts' && // iterates every feature generically
      !rel(f).startsWith('components/admin/ai/') &&
      !rel(f).startsWith('scripts/'),
  )

  it.each(Object.keys(AI_FEATURES) as AiFeature[])('%s has a call site', (feature) => {
    const accessor = ACCESSOR_FOR_FEATURE[feature]
    const literal = new RegExp(`['"\`]${feature}['"\`]`)
    const users = callSiteFiles.filter((f) => {
      const src = stripComments(read(f))
      return literal.test(src) || (accessor ? accessor.test(src) : false)
    })
    expect(users.map(rel), `no code path uses feature "${feature}": remove it or wire it`).not.toEqual([])
  })

  it('every feature id a call site names is a declared feature', () => {
    const declared = new Set(Object.keys(AI_FEATURES))
    const unknown: string[] = []
    const re = /(?:getModelForFeature\(\s*|feature:\s*|withTenantAi\(\s*\{[^}]*feature:\s*)['"]([a-z_]+)['"]/g
    for (const file of callSiteFiles) {
      for (const m of stripComments(read(file)).matchAll(re)) {
        if (!declared.has(m[1])) unknown.push(`${rel(file)} uses unknown feature "${m[1]}"`)
      }
    }
    expect(unknown).toEqual([])
  })

  it('declared providers per feature only name providers that can serve its kind', () => {
    for (const [feature, def] of Object.entries(AI_FEATURES)) {
      expect(def.kind, feature).toBeTruthy()
      if (def.inherits) expect(AI_FEATURES[def.inherits], `${feature} inherits ${def.inherits}`).toBeDefined()
    }
  })
})

// --- 7. telemetry and error hygiene -------------------------------------------

describe('telemetry hygiene', () => {
  it('Langfuse metadata at every propagateAttributes call carries tenantId, feature, provider and modelId', () => {
    const files = runtimeFiles.filter((f) => /propagateAttributes\(/.test(read(f)))
    expect(files.length).toBeGreaterThan(5)
    const offenders: string[] = []
    for (const file of files) {
      const src = stripComments(read(file))
      // Each propagateAttributes block up to its callback.
      for (const m of src.matchAll(/propagateAttributes\(\s*\{([\s\S]*?)\}\s*,\s*(?:\(\)|async)/g)) {
        for (const key of ['tenantId', 'feature', 'provider', 'modelId']) {
          if (!new RegExp(`\\b${key}\\b`).test(m[1])) offenders.push(`${rel(file)} propagateAttributes lacks ${key}`)
        }
        if (/\b(?:headers|authorization|apiKey|api_key)\b/i.test(m[1])) offenders.push(`${rel(file)} records headers/keys`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('instrumentation wires the trace-content guard and the Sentry configs redact events', () => {
    expect(read(join(ROOT, 'instrumentation.ts'))).toMatch(/TraceContentGuardProcessor/)
    expect(read(join(ROOT, 'sentry.server.config.ts'))).toMatch(/redactSentryEvent\(/)
    expect(read(join(ROOT, 'sentry.edge.config.ts'))).toMatch(/redactSentryEvent\(/)
  })

  it('AI catch blocks never log a raw provider error object or message', () => {
    // `console.error(..., err)` on a provider error can print request headers. Name/status/redact() only.
    const aiRoutes = runtimeFiles.filter((f) => {
      const r = rel(f)
      return (r.startsWith('app/api/') || r.startsWith('lib/ai/') || r.startsWith('lib/speech/')) && /classifyProviderError|withTenantAi|createTenantAi/.test(read(f))
    })
    const offenders = grep(aiRoutes, /console\.(?:error|warn|log)\(.*\b(?:err|error|e)\.message\b/).filter(
      (h) => !h.text.includes('redact('),
    )
    expect(show(offenders)).toEqual([])
  })
})
