export const meta = {
  name: 'survey-765-brand-outputs',
  description: 'Read-only survey of emails, certificates, OG images and the kit color engine for #765',
  phases: [{ title: 'Survey', detail: 'one read-only agent per surface' }, { title: 'Critic', detail: 'completeness check over all surveys' }],
}

const RULES = `
You are surveying code for GitHub issue #765 in the lms-front repo (cwd). This is READ-ONLY research.
Side effects are FORBIDDEN: do not create, edit, move or delete any file; do not run git commands that change state (no checkout/commit/stash/branch); do not write to any database (local or cloud) — SELECT-only SQL is fine; do not post to GitHub, Slack or any network service; do not start or stop servers or docker. Reading files, grep, find, git log/show/diff, and running read-only unit tests (npx vitest run <file>) are allowed.

Issue #765 goal: what a school sends out (emails, certificates, share/OG previews) carries its logo, brand color and heading font, not the platform's hardcoded palette. The theme kit engine is lib/themes/kit.ts (KIT_THEMES, KIT_SURFACES, resolveSchoolTheme(value,{customBranding}), deriveKitVars(theme, brand) -> {light,dark} CSS var maps with --brand/--primary/--primary-foreground/--brand-text/--brand-tint etc, deriveKitStructure(theme) -> fonts/radii, KIT_TYPE_PAIRINGS heading/body families). A school's theme is tenant_settings row setting_key='theme_preset' with jsonb {type:'kit',theme,brand}. Custom brand hex requires plan feature 'custom_branding' (hasPlanFeature in lib/plans/server.ts). app/[locale]/layout.tsx shows how the page resolves it. No theme row = platform palette.
Emails cannot use CSS variables — they need literal hex resolved server-side. Some surfaces emit oklch() strings, so hex conversion may be needed (look at lib/color/*).

Be concrete: file paths with line numbers, exact current values, exact call sites. Return every "judgment call" (a decision a human orchestrator must make) explicitly with options and your recommendation, rather than deciding silently.
`

const SURVEY_SCHEMA = {
  type: 'object',
  properties: {
    area: { type: 'string' },
    summary: { type: 'string', description: '5-15 sentences: current state and recommended approach' },
    files: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          current: { type: 'string', description: 'what it does today re colors/fonts/logo, with line numbers and literal values' },
          change: { type: 'string', description: 'recommended change' },
        },
        required: ['path', 'current', 'change'],
      },
    },
    facts: { type: 'array', items: { type: 'string' }, description: 'verified non-obvious facts (schema, runtime, caching, call graph) with file:line evidence' },
    risks: { type: 'array', items: { type: 'string' } },
    judgment_calls: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          question: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          recommendation: { type: 'string' },
        },
        required: ['id', 'question', 'options', 'recommendation'],
      },
    },
    test_plan: { type: 'array', items: { type: 'string' } },
  },
  required: ['area', 'summary', 'files', 'facts', 'risks', 'judgment_calls', 'test_plan'],
}

const AREAS = [
  {
    key: 'emails',
    prompt: `AREA: transactional emails.
Read lib/email/send.ts, client.ts, status.ts and EVERY template in lib/email/templates/*.ts, plus EVERY call site of each template (grep for the template function names across app/ lib/ components/ mcp-server/src). For each template decide: is it SCHOOL-branded (a school talking to its students/members: enrollment-confirmed, invitation, joined-school, certificate-issued, course-removed, payment-instructions, daily-digest/streak nudge, ...) or PLATFORM-branded (the platform billing a school admin: renewal-reminder, plan-downgraded, payment-request-expired, downgrade-blocked, access-cutoff-warning, payment-failed, ...)? Verify by reading who the recipient is and what the copy says; list it per template with evidence.
For each school-branded call site: is a tenant id in scope? Is it a request context (headers available) or a webhook/cron (no x-tenant-id header)? Is there a school logo URL / school name already passed? List every inline hex in each template with what it styles (heading, button bg, button text, muted text, border, footer).
Design a shared email brand helper: input tenantId (and maybe an admin supabase client) -> {brand, buttonBg, buttonInk, brandText (on white), logoUrl, schoolName, headingFontStack} with a platform fallback. Check how tenant_settings logo_url/site_name are stored (layout.tsx does tenantSettings.site_name?.value || tenant.name) and whether hasPlanFeature/getTenantPlan (lib/plans/server.ts) work outside a request (React cache(), createAdminClient usage). Check whether emails can render web fonts (they mostly can't — recommend a font-family stack with generic fallback) and whether an email body is white regardless of kit surface (recommend: emails stay on a light surface; derive the button from the LIGHT mode mapping).
Also: are there existing unit tests for email templates (tests/unit)? How could a QA person SEE a rendered email locally — does anything route sendEmail to Mailpit/Inbucket locally, or only Mailgun? (check supabase/config.toml for inbucket/mailpit, .env.example, lib/email/client.ts). Recommend a QA method (e.g. a script that renders each template to HTML files and screenshots them with Playwright).`,
  },
  {
    key: 'certificates',
    prompt: `AREA: certificates (PDF + preview + template design).
Read lib/certificates/default-design.ts, pdf-generator.tsx, issue-certificate.ts, badge-generator.ts, open-badges.ts, and find certificate-template-context.tsx, certificate-preview.tsx and every certificate editor/preview/verify component and page (grep -ril certificate app components lib). Also app/api/certificates/**. Read getCertificateTier in lib/plans/server.ts and how 'basic' vs 'custom' tiers affect design (hasCustomCertificateDesign).
Answer precisely: where are colors and fonts hardcoded (file:line, values, Georgia etc.)? How does the PDF get generated (@react-pdf/renderer? which fonts are registered via Font.register, from where — local TTF files, URLs?), and where does a certificate template's design_settings come from (certificate_templates table columns — check supabase/migrations and lib/database.types.ts)? When a school has NO custom design (default design), what colors are used, and how do we tell "default design" from "custom template" at render time — is a template row with primary_color equal to DEFAULT_CERTIFICATE_DESIGN.primary_color treated as default? What does the issue mean by "The default design takes the school's brand and heading font. Custom templates (Starter+) keep their own colors"?
Critical feasibility question: can @react-pdf render the kit heading fonts (Instrument Sans, Lora, Outfit, Noto Sans)? Are TTF/WOFF files available anywhere in the repo or node_modules (e.g. @fontsource packages, next/font google cache)? react-pdf supports TTF/WOFF (not WOFF2) via Font.register with a URL or path. Check package.json deps and node_modules for @fontsource/*, and what fonts pdf-generator currently registers. Recommend the least risky way to get each heading font into the PDF, and a fallback (Helvetica/Times) if not.
Is the PDF generated at issue time and stored (storage bucket) or on demand? Does the certificate verify page (/verify) render its own styled view? Does the badge generator (SVG/PNG) use colors? List every surface a certificate appears on and whether it should follow the school brand.`,
  },
  {
    key: 'og',
    prompt: `AREA: OG / share images and metadata.
Read app/api/og/route.tsx fully. Find every caller/reference of /api/og (grep across app/ components/ lib/ for 'api/og' and generateMetadata openGraph images), plus any opengraph-image.* / twitter-image.* files. Determine: runtime (edge vs nodejs), params it accepts, current colors/fonts/logo, how it gets tenant context (x-tenant-id header? query param? none?), whether proxy.ts runs for /api/og and sets x-tenant-id (read proxy.ts matcher and api handling), and caching headers.
Design the change so a course share image shows the school's brand color, logo and name: how the route resolves the tenant (header from proxy vs a tenant slug query param — note crawlers fetch the image URL directly on the school subdomain), how it loads theme_preset + plan gate (resolveSchoolTheme needs customBranding), logo_url/site_name from tenant_settings, and security: must not let a query param spoof another school's brand/name (e.g. ?title= free text is already there? check for XSS/abuse). Check whether next/og ImageResponse can load the logo (remote image fetch, SVG vs PNG support) and fonts (satori needs TTF/OTF ArrayBuffers; woff2 unsupported). Check if the course/landing pages' generateMetadata point to this route and with which params. Pick what text color to use on a brand-colored background (readableButton / KIT inks from lib/themes/kit.ts and lib/color/contrast.ts).`,
  },
  {
    key: 'engine',
    prompt: `AREA: color engine reuse + a server-side "school brand" resolver + optional tenants.primary_color cleanup.
Read lib/themes/kit.ts fully, lib/color/*.ts fully, lib/themes/fonts.ts, components/tenant/tenant-css-vars-server.tsx, app/[locale]/layout.tsx, lib/plans/server.ts, lib/supabase/tenant.ts and wherever getTenantSettings/getCurrentTenant are defined (grep). Existing tests: tests/unit/theme-kit*.test.ts and any color tests.
Answer: which values in deriveKitVars output are hex vs oklch()? Is there an existing oklch->hex (sRGB) converter (parseColor, toHex, formatHex)? What does readableButton return (shape, color format)? For emails/PDF/OG we need literal hex for: brand, button background, button ink, brand text on a white/light surface, and maybe tint. Propose a pure function, e.g. deriveKitHexPalette(theme, brand, mode='light') or resolveBrandOutputs, placed in lib/themes/kit.ts or a new lib/themes/brand-outputs.ts, with exact signature, and the platform fallback when a school has no theme row (what is the platform default brand today? look at app/globals.css --primary teal oklch(0.52 0.105 223.128) and #2563eb in emails; the epic proposes Estructura/Tinta azul #3A50B8 as future default — note it as a judgment call).
Propose a server loader getSchoolBrand(tenantId) that reads tenant_settings (theme_preset, logo_url, site_name) + tenants (name, logo_url, plan) and the custom_branding gate, usable from server actions, route handlers, webhooks and cron (no request headers, no cookies) — which supabase client (createAdminClient), and whether React cache()/unstable_cache is safe there (unstable_cache is used by layout's getTenantSettings? check). Mind tenant_settings setting_value jsonb shapes.
Optional cleanup: find EVERY reader and writer of tenants.primary_color and tenants.secondary_color and tenant_settings primary_color/secondary_color across app/ lib/ components/ mcp-server/ supabase/migrations/ supabase/seed.sql tests/ (grep 'primary_color', 'secondary_color'). Distinguish certificate design_settings.primary_color (not the same thing) from tenant columns. Say whether dropping tenants.primary_color/secondary_color is safe now, what views/functions/RLS/types reference them (grep migrations for the column names in CREATE VIEW / FUNCTION), and what the migration + lib/database.types.ts edit would be (note: db:types targets CLOUD --linked; gen types --local fails per repo notes, so hand-editing types may be needed).`,
  },
  {
    key: 'qa-and-tests',
    prompt: `AREA: QA method and test infrastructure for #765 acceptance:
- "Enrollment + invitation emails render in Andina/Verde andino and Kódigo/Amarillo (Mailpit screenshots)"
- "Default certificate PDF uses the brand color and heading font; custom templates unchanged"
- "Course share image shows school brand"
Investigate: is Mailpit/Inbucket running in local supabase (supabase/config.toml [inbucket], ports) and can our app's sendEmail (lib/email/send.ts uses Mailgun) reach it? If not, what is the most honest way to produce "rendered email" screenshots — e.g. a tsx script under scripts/ that imports the templates with a tenant brand and writes HTML files, then Playwright screenshots them. Look at existing scripts/ (e.g. scripts/qa-*.ts, scripts/qa-contact-sheet.ts) for conventions, how they run (npx tsx), and how they import app code with @/ aliases.
For the certificate PDF: how is a PDF produced in tests or locally (route? server action? pdf-generator exports?) and how could we render page 1 of a PDF to PNG for a screenshot (pdftoppm available? check 'which pdftoppm mutool magick' — read-only command). For OG: the route URL to hit locally (http://<tenant>.lvh.me:<port>/api/og?...), which port the dev server uses (check .env.local for BASE_URL/PORT without printing secrets, playwright.config.ts, package.json scripts, memory note says E2E pinned to 3005).
Local data: SELECT-only against local DB via 'docker exec' on the supabase db container (find container name with 'docker ps --format {{.Names}}' — read-only) or supabase MCP read-only: which tenants exist, their theme_preset rows, plans, logo_url settings, certificate_templates rows, courses to use for the OG test. Do NOT modify rows.
List existing unit tests touching email templates, certificates, og route, theme kit (tests/unit), and Playwright specs touching certificates/og/email. Recommend concrete unit tests to add and a QA script outline. Return commands a QA person runs.`,
  },
]

phase('Survey')
const surveys = await parallel(AREAS.map(a => () =>
  agent(RULES + '\n' + a.prompt, { label: `survey:${a.key}`, phase: 'Survey', schema: SURVEY_SCHEMA, model: 'sonnet', effort: 'high' })
))
const done = surveys.filter(Boolean)
log(`${done.length}/${AREAS.length} surveys returned`)

phase('Critic')
const critic = await agent(RULES + `
You are the completeness critic. Below are ${done.length} surveys for #765. Your job: find what they MISSED or got WRONG. Verify their most load-bearing claims yourself by reading the cited code (at least: the font feasibility claim for the PDF, the tenant-context claim for the OG route, the hex/oklch claim for the engine, and the school-vs-platform classification of each email template). Also sweep for other outbound surfaces a school sends that none of them covered (e.g. Supabase auth email templates in supabase/templates or config.toml, badge images, invoice PDFs, calendar/ics, push notifications, MCP widgets, landing page metadata, favicon/manifest). Report contradictions between surveys.

SURVEYS:
${JSON.stringify(done, null, 1)}`, {
  label: 'critic', phase: 'Critic', model: 'sonnet', effort: 'xhigh',
  schema: {
    type: 'object',
    properties: {
      wrong_claims: { type: 'array', items: { type: 'object', properties: { claim: { type: 'string' }, correction: { type: 'string' }, evidence: { type: 'string' } }, required: ['claim', 'correction', 'evidence'] } },
      missed_surfaces: { type: 'array', items: { type: 'object', properties: { surface: { type: 'string' }, evidence: { type: 'string' }, in_scope_recommendation: { type: 'string' } }, required: ['surface', 'evidence', 'in_scope_recommendation'] } },
      contradictions: { type: 'array', items: { type: 'string' } },
      extra_judgment_calls: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, question: { type: 'string' }, options: { type: 'array', items: { type: 'string' } }, recommendation: { type: 'string' } }, required: ['id', 'question', 'options', 'recommendation'] } },
    },
    required: ['wrong_claims', 'missed_surfaces', 'contradictions', 'extra_judgment_calls'],
  },
})

return { surveys: done, critic }
