export const meta = {
  name: 'implement-765-brand-outputs',
  description: 'Implement #765: emails, certificates and OG images use the school brand (sonnet agents, verify + repair per unit)',
  phases: [
    { title: 'Before', detail: 'capture app-surface before artifacts' },
    { title: 'Implement', detail: 'emails, certificates, OG, contract tests' },
    { title: 'Verify', detail: 'adversarial check per unit' },
    { title: 'Repair', detail: 'fix confirmed findings' },
  ],
}

const SCRATCH = '/private/tmp/claude-501/-Users-guillermomarin-Documents-GitHub-lms-front/dcd78b66-504e-4c3e-ac33-f69206496fb1/scratchpad'

const CONTEXT = `
You are working in the lms-front repo (cwd), branch feat/theme-kit-brand-outputs-765, on GitHub issue #765 (phase 5 of the theme kit epic #766):
"What a school sends out (emails, certificates, share previews) carries its logo, brand color and heading font, not the platform's hardcoded palette."
Acceptance: (1) enrollment + invitation emails render in Andina/Verde andino and Kódigo/Amarillo; (2) the default certificate PDF uses the brand color and heading font, custom templates unchanged; (3) the course share image shows the school brand.

SEVERAL AGENTS EDIT THIS SAME WORKING TREE AT THE SAME TIME, each owning a disjoint file list. Rules for everyone:
- Edit ONLY files in your ownership list (plus new files you create inside the paths it allows). If you need a change elsewhere, do not make it: put it in needs_outside_change.
- NEVER run git commands that change state (add, commit, stash, checkout, reset, restore, branch, rebase, push). git diff/status/show/log are fine.
- NEVER run \`npm run build\` / \`next build\`. NEVER stop or restart the dev server. NEVER touch the cloud database or any supabase-cloud MCP tool. NEVER post to GitHub/Slack.
- Typecheck with \`npx tsc --noEmit -p tsconfig.json\` and report only errors in your own files (other agents' in-flight edits may cause unrelated errors). Lint your files with \`npx eslint <files>\`. Run unit tests with \`npx vitest run <test files>\`.
- Match the surrounding code's comment density, naming and idiom. Comments explain why, briefly. No back-compat shims: breaking a template signature and updating every caller is preferred over optional fallbacks.
- Beware: the Edit tool trims trailing spaces in new_string; do not glue class names or tokens together.

THE CONTRACT (already written by the orchestrator, final — do NOT edit these files: lib/themes/brand-outputs.ts, lib/themes/school-brand.ts, lib/themes/brand-fonts.ts, lib/themes/kit.ts, lib/color/*; public/fonts/kit/* are final too). Read all three new files first.
- \`getSchoolBrand(tenantId): Promise<SchoolBrand>\` (lib/themes/school-brand.ts): server-side, service-role client, no headers/cookies needed, React cache(), never throws (falls back to platform palette). \`SchoolBrand = { tenantId, name (site_name setting > tenants.name; '' only if tenant row missing), logoUrl (absolute http(s) or null), theme (plan-resolved StoredKitTheme | null), outputs: BrandOutputs }\`.
- \`deriveBrandOutputs(theme | null): BrandOutputs\` (lib/themes/brand-outputs.ts, pure) — all colours uppercase #RRGGBB designed on WHITE paper: brand (decorative only, never text), button + buttonInk (AA) + buttonBorder, brandText (AA on white and on tint), tint, deep + deepInk (7:1) + deepMuted (AA on deep), paper '#FFFFFF', headingFont ('Instrument Sans'|'Lora'|'Outfit'|'Noto Sans' | null), emailHeadingFontStack. No theme row => platform teal #007595 and headingFont null.
- \`normalizeLogoUrl\`, \`KIT_HEADING_FONT_FILES\` (TTF paths relative to process.cwd(), under public/fonts/kit/, weights 400 and 700).
- lib/themes/brand-fonts.ts (Node only): \`headingFontPath(family, weight): string | null\` (absolute path, for @react-pdf Font.register and node-canvas registerFont) and \`readHeadingFont(family, weight): Promise<Buffer | null>\` (bytes, for satori ImageResponse fonts). null => keep the renderer's built-in face.
- NEVER feed deriveKitVars() output into these surfaces (its button ink is an oklch() string). NEVER read tenants.primary_color / tenants.secondary_color (frozen legacy columns).

DECISIONS (binding):
D1 No theme row => platform palette outputs (teal) and the renderer's CURRENT typeface (headingFont null). A theme => its brand outputs and heading font.
D2 Brand is resolved server-side from the tenant id the code already trusts (certificate row tenant_id, the action's tenant, webhook metadata tenant, the proxy's x-tenant-id) — never from a query parameter or request body.
D3 Outputs are designed on white paper even for dark themes (Kódigo).
D4 Status colours (success green, warning, error red) are not brand colours; leave them.

LOCAL ENVIRONMENT FACTS: local Supabase in docker (container supabase_db_lms-front; SQL via \`docker exec supabase_db_lms-front psql -U postgres -At -c "..."\`). App dev server port 3005 on lvh.me (never localhost): http://default.lvh.me:3005 and http://code-academy.lvh.me:3005. Tenant default (00000000-0000-0000-0000-000000000001, plan starter) has theme_preset {"type":"kit","theme":"kodigo","brand":"#F2B705"} (Kódigo/Amarillo). Tenant code-academy (…0002, plan enterprise) has NO theme row (platform palette). certificate_templates: tenant 001 course 1001 and tenant 002 (course null) both carry CUSTOM design_settings {"primary_color":"#1a5632","secondary_color":"#0f2b1a"}. Course 1002 (tenant 001) has no template. The only certificate row is verification_code QA764PUBLIC (tenant 002, course 2001, custom template). Test accounts: student@e2etest.com / owner@e2etest.com (admin + super admin, default tenant) / creator@codeacademy.com (admin, code-academy) — all password123.
`

const IMPL_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    files_changed: { type: 'array', items: { type: 'string' } },
    decisions_taken: { type: 'array', items: { type: 'string' }, description: 'every non-obvious choice you made that a reviewer should know' },
    tests_run: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, result: { type: 'string' } }, required: ['command', 'result'] } },
    contract_issues: { type: 'array', items: { type: 'string' }, description: 'bugs or gaps in lib/themes/brand-outputs.ts / school-brand.ts / brand-fonts.ts' },
    needs_outside_change: { type: 'array', items: { type: 'string' } },
    open_questions: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'files_changed', 'decisions_taken', 'tests_run', 'contract_issues', 'needs_outside_change', 'open_questions'],
}

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', description: 'one paragraph' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          file: { type: 'string' },
          line: { type: 'number' },
          problem: { type: 'string' },
          evidence: { type: 'string', description: 'what you ran or read that proves it' },
          fix: { type: 'string' },
        },
        required: ['severity', 'file', 'problem', 'evidence', 'fix'],
      },
    },
  },
  required: ['verdict', 'findings'],
}

const UNITS = [
  {
    key: 'emails',
    resume: `RESUMING: a previous agent's session died mid-run. Steps 1–4 appear done in the working tree (git diff shows the 7 templates, school-brand-parts.ts and callers changed; no '#2563eb' remains). tests/unit/email-school-brand.test.ts does NOT exist yet. Read the current diff first, check steps 1–4 against the task and finish anything missing, then do steps 5–6.`,
    owns: `lib/email/templates/enrollment-confirmed.ts, invitation.ts, joined-school.ts, certificate-issued.ts, course-removed.ts, payment-instructions.ts, daily-digest.ts; NEW lib/email/templates/school-brand-parts.ts; every CALLER of those 7 template functions (known: app/actions/join-school.ts, app/actions/payment-requests.ts, app/actions/admin/invitations.ts, app/actions/teacher/courses.ts, app/api/stripe/webhook/route.ts, lib/notifications/daily-digest.ts, app/api/certificates/issue/route.ts — grep app/ lib/ components/ scripts/ tests/ for more); tests/unit/email-*.test.ts (new and existing) and any existing unit test that calls those templates or their callers.`,
    task: `UNIT: school-branded transactional emails.
The 7 school templates above speak as the school to its students/members; they get the school brand. The 6 platform billing templates (access-cutoff-warning, downgrade-blocked, payment-failed, payment-request-expired, plan-downgraded, renewal-reminder — recipient is the school admin, footer "LMS Platform Billing", urgency colours) stay EXACTLY as they are; do not edit them.
Do:
1. Each of the 7 template data interfaces gets a REQUIRED \`brand: SchoolBrand\` (import type from '@/lib/themes/school-brand'). Keep the existing schoolName field (callers set it to \`brand.name || <their existing fallback>\`).
2. New lib/email/templates/school-brand-parts.ts with small shared helpers, e.g. \`schoolLogoHeader(brand)\` (an <img> only when brand.logoUrl: alt = school name, height 40, style display:block;max-height:40px;width:auto;border:0;margin:0 0 16px — nothing otherwise), \`schoolButton(brand, href, label)\` (inline styles: background brand.outputs.button, color brand.outputs.buttonInk, border:1px solid brand.outputs.buttonBorder, keep today's padding/radius/weight), and a heading style string (color brand.outputs.brandText; font-family brand.outputs.emailHeadingFontStack). HTML-escape every interpolated brand string (school name, logo URL in an attribute). Reuse an existing escape helper if one is shared; payment-instructions.ts and course-removed.ts each have a local escapeHtml — you may move one into the parts file and import it from both.
3. In all 7 templates: logo header at the top of the body; every #2563eb heading → brand heading style (daily digest and streak nudge <h2> currently have no colour: give them the same brand heading style for consistency); every #2563eb filled CTA → schoolButton. certificate-issued's secondary neutral "Verify Online" button (#f3f4f6/#1a1a1a) stays neutral. Neutral text/border greys (#1a1a1a, #666, #999, #eee, #f5f5f5) stay. Body font stays sans-serif; only headings take the heading stack. No oklch()/var(--…) may appear in email HTML.
4. Every caller resolves \`await getSchoolBrand(tenantId)\` ONCE per event using the tenant id it already trusts (request context: getCurrentTenantId or the action's tenant; webhook/cron: the explicit tenant id it already has). Bulk sends (course-removed to every enrolled student, daily digest per tenant) fetch once and reuse — never once per recipient. Read each caller fully first; in the daily digest cron, check how tenants are iterated. Where a caller currently queries tenants.name only to build schoolName, replace that with brand.name (keep a fallback) if it removes a query without changing behaviour.
5. Tests: new tests/unit/email-school-brand.test.ts building brands with deriveBrandOutputs (no DB): for Andina/#2F6B4F, Kódigo/#F2B705 and platform (null) assert enrollment + invitation (and the other 5) HTML contains outputs.button, outputs.buttonInk, outputs.brandText, the heading stack, no '#2563eb', no 'oklch(' and no 'var(--'; logo <img> present only with a logoUrl and attribute-escaped (try a URL containing a double quote); school name escaped. A regression test that the 6 platform templates still contain 'LMS Platform Billing' and none of the school brand values. Update existing tests that call changed signatures (e.g. tests/unit/email-mailer-status.test.ts). Mock getSchoolBrand where a caller's unit test needs it.
6. Run: npx vitest run tests/unit/email-*.test.ts plus any test you touched; tsc (own files); eslint (own files).`,
  },
  {
    key: 'certificates',
    waitForBefore: true,
    owns: `lib/certificates/default-design.ts, lib/certificates/pdf-generator.tsx, lib/certificates/badge-generator.ts, lib/certificates/issue-certificate.ts, lib/certificate-generator.ts, app/api/certificates/[id]/route.ts, app/api/certificates/view/[code]/route.ts, app/api/certificates/generate/route.ts, app/[locale]/verify/[code]/page.tsx (page body only — do NOT change its generateMetadata/ogImageUrl call), components/teacher/certificate-preview.tsx, the certificate template context file (find certificate-template-context.tsx), the teacher/admin certificate template editor page(s) that render CertificatePreview (only to pass a brand prop down), NEW files under lib/certificates/, tests/unit/certificate-*.test.ts. NOT app/api/certificates/issue/route.ts (the emails agent owns it) — keep issueCertificate()'s exported signature unchanged so that route needs no edit.`,
    task: `UNIT: certificates use the school brand for the DEFAULT design; custom templates unchanged.
Current state (verify it yourself): DEFAULT_CERTIFICATE_DESIGN = {primary_color '#3B82F6', secondary_color '#1E40AF', show_qr_code true} is the plan-tier baseline (hasCustomCertificateDesign gates the Starter+ 'custom' tier in the save action — do not change that function's behaviour). The PDF (lib/certificates/pdf-generator.tsx) falls back to green #1a5632/#0f2b1a and uses Helvetica with no Font.register; the HTML view (lib/certificate-generator.ts) falls back to the same green and uses Cormorant Garamond/DM Sans from Google Fonts; the badge (lib/certificates/badge-generator.ts, node-canvas) falls back to #1a73e8/#0d47a1 in Arial and imports registerFont without calling it; the verify page accent falls back to DEFAULT_CERTIFICATE_DESIGN.primary_color; the editor preview (components/teacher/certificate-preview.tsx) hardcodes Georgia and documents that the school THEME must never recolour the printed paper. The PDF is generated at issue time (stored pdf_url) and on demand (GET /api/certificates/[id]?format=pdf).
Do:
1. In lib/certificates/default-design.ts add a pure resolver, e.g. \`resolveCertificateDesign(designSettings, brand: BrandOutputs)\` → { schoolBranded: boolean, primary, secondary, accentText, headingFont: KitHeadingFont | null }. schoolBranded is true when there is no template/design_settings, or when both colours are missing or equal (case-insensitive) to DEFAULT_CERTIFICATE_DESIGN — i.e. the colours were never customised (a logo or signature alone does NOT make the colours custom). schoolBranded → primary = brand.brand (decorative: borders, rules, seals), accentText = brand.brandText (any brand-coloured TEXT on paper), secondary = brand.deep, headingFont = brand.headingFont. Custom colours → the template's own primary/secondary exactly as today, accentText = primary (unchanged rendering), headingFont = null. Export and unit test it.
2. Every renderer uses it with \`getSchoolBrand(<certificate or template tenant_id>)\` resolved server-side: PDF (issue-time and on-demand), HTML view (both routes that call generateCertificateHTML), badge PNG, verify page accent. Resolve the tenant from the certificate/template row, never from query params. Where a renderer draws brand-coloured TEXT, use accentText; decorative strokes/fills use primary/secondary. For custom templates the output must be byte-for-byte the same styling as today.
3. Heading font: PDF → \`Font.register({ family: \\\`Kit \${font}\\\`, fonts: [{ src: headingFontPath(font, 400), fontWeight: 400 }, { src: headingFontPath(font, 700), fontWeight: 700 }] })\` once per family per process, only when both paths are non-null; titles/student name/course name use that family (pick weights that match today's hierarchy; the kit families have no italic file, so do not request italic for them); otherwise keep Helvetica exactly as today. HTML view → when headingFont is set, an inline @font-face pointing at '/fonts/kit/<file>.ttf' (public/ serves them; derive the file names from KIT_HEADING_FONT_FILES by stripping 'public') replaces the Cormorant Garamond usage for headings; otherwise keep today's fonts. Badge → registerFont(headingFontPath(...), { family, weight }) once, before createCanvas, only when the path exists; otherwise Arial as today. Check that react-pdf's Font.register accepts an absolute file path in this Node setup (read node_modules/@react-pdf/font) and actually render a PDF in a quick tsx script to prove the font embeds (e.g. check the PDF bytes contain the font name) — write scratch scripts under ${SCRATCH}/cert/ only.
4. Editor preview: pass the school brand (outputs + whether the page has a theme) from the server page into CertificatePreview; when the editor's current colours are the defaults, the preview shows accentText/primary/secondary from resolveCertificateDesign and uses 'var(--font-heading)' for headings when headingFont is set (the page runs inside the school's themed app, where --font-heading is the kit heading font); custom colours preview exactly as today. Update the component's explanatory comment: the SURFACE theme still never recolours the paper, but the default design's ink is the school brand (#765). Keep the paper fixed white/cream as today.
5. Do not add the school logo to certificates (react-pdf only supports some raster formats and the logo URL is free text) — note it in decisions_taken.
6. Tests: tests/unit/certificate-brand.test.ts (resolver branches incl. case-insensitive defaults, logo-only template still school-branded, custom colours untouched, null brand theme → platform outputs); if feasible a unit test that the HTML generator output contains brand hex + @font-face for a themed brand and today's green/Cormorant for a custom template. Run existing tests/unit/certificate-*.test.ts. tsc + eslint on own files.`,
  },
  {
    key: 'og',
    waitForBefore: true,
    owns: `app/api/og/route.tsx, NEW files under lib/og/, lib/seo.ts, app/[locale]/(public)/courses/[id]/page.tsx (generateMetadata only), tests/unit/og-*.test.ts. Read but do not edit other callers of ogImageUrl (root layout, products/[productId], p/[slug], verify/[code]) — they must keep working unchanged.`,
    task: `UNIT: OG / share images show the school brand.
Current state (verify it): app/api/og/route.tsx (Node runtime, force-dynamic, cache-control public max-age=3600 s-maxage=86400) renders 'generic' and 'certificate' cards from query params only, in a fixed purple palette with satori's default font, no logo, no tenant awareness. proxy.ts runs for /api/* and sets x-tenant-id from the Host before the /api branch. lib/seo.ts ogImageUrl()/buildPageMetadata() build the URL; courses/[id]/page.tsx passes image: course.thumbnail_url so courses with a thumbnail never reach /api/og.
Do:
1. The route resolves the tenant from the x-tenant-id request header (check lib/supabase/tenant.ts getCurrentTenantId and what it returns with no header) and loads getSchoolBrand(tenantId). Card colours come ONLY from brand.outputs: background = a gradient from outputs.deep to a darker stop (mixOklch(deep,'#000000',0.35) → uppercase hex; import from lib/color/contrast), primary text outputs.deepInk, secondary text outputs.deepMuted, accent bars / dots outputs.brand. Remove the purple palette entirely (no theme → platform teal via outputs). The certificate card's verified-badge green is a status colour: keep it. School name on the card = brand.name; the \`site\` query param is only a fallback when brand.name is empty (it must not override a real school's name). Keep accepting every existing query param so current callers (root layout, products, p/[slug], verify page) keep working without edits.
2. Heading font: when outputs.headingFont is set, pass ImageResponse \`fonts\` with readHeadingFont(font, 700) and (font, 400) (skip any that return null) and use that family for the title/heading text; otherwise keep satori's default exactly as today.
3. Logo: when brand.logoUrl is set, fetch it server-side via a NEW lib/og/fetch-image.ts helper and pass satori a data URL; render it next to the school name (about 44–56px tall, objectFit contain). The helper must: allow only http(s); in production (process.env.NODE_ENV === 'production') require https and reject hostnames that are 'localhost' or IP literals in loopback/private/link-local/unique-local ranges (IPv4 and IPv6); follow at most 2 redirects MANUALLY, re-validating every hop; AbortController timeout ~3s; reject content-types other than image/png, image/jpeg (and image/gif only if satori supports it — check node_modules/next/dist/compiled/@vercel/og); cap the body at ~1.5MB while streaming (do not trust content-length alone); return null on any failure (never throw). Unit test it with a mocked global fetch (redirect to private IP in production rejected, oversize rejected, wrong type rejected, happy path data URL).
4. Course card: add \`type=course&courseId=<id>\`: the route loads the course with the admin client by course_id AND tenant_id = the resolved tenant AND status 'published' (anything else → render the generic card from the params); the title comes from the DB row; if the course has thumbnail_url, fetch it through the same helper and show it on one side of the card with the brand panel (logo, school name, course title) on the other; without a thumbnail, a brand-only card. courses/[id]/page.tsx generateMetadata then always uses the branded course card (ogImageUrl({ type: 'course', courseId, ... }) through buildPageMetadata — extend buildPageMetadata minimally so a caller can pass extra og params) instead of the raw thumbnail. Read the page's current metadata code fully first and keep title/description/alternates intact.
5. Lower s-maxage to 3600 so a school's brand change reaches shared links within an hour; keep max-age.
6. Extract the pure colour/layout decisions into a testable module under lib/og/ (e.g. ogCardPalette(outputs)) and unit test: every value is #RRGGBB, no 'oklch(' anywhere, deepInk on deep ≥ 7, deepMuted on both gradient stops ≥ 4.5 (if the darker stop breaks that, adjust the stop, not the contract).
7. Prove the route renders: with the dev server on port 3005 (it may be running already — do NOT start/stop it; if it is not reachable, skip and say so), curl -s -o ${SCRATCH}/og/<name>.png -w '%{http_code} %{content_type}' for generic, certificate and course cards on default.lvh.me and code-academy.lvh.me, check each is image/png with non-trivial size, and Read one PNG per tenant to look at it. Run tsc + eslint on own files and vitest on your tests.`,
  },
  {
    key: 'contract-tests',
    skipImpl: true,
    owns: `NEW tests/unit/brand-outputs.test.ts and NEW tests/unit/school-brand.test.ts only.`,
    task: `UNIT: unit tests for the orchestrator's contract modules (do NOT edit the modules; report bugs in contract_issues with a failing test name).
1. tests/unit/brand-outputs.test.ts: for all 4 KIT_THEME_IDS × each of their 6 swatches, plus custom brands #FFFF00, #000000, #FFFFFF, #777777, and null (platform): every colour field matches /^#[0-9A-F]{6}$/ (no 'oklch('); contrastRatio(button, buttonInk) ≥ 4.5; brandText on paper and on tint ≥ 4.5; deepInk on deep ≥ 7; deepMuted on deep ≥ 4.5; buttonBorder vs paper ≥ 3 OR buttonBorder === brandText; headingFont equals KIT_TYPE_PAIRINGS[KIT_THEMES[id].typePairing].heading for themes and null for platform; emailHeadingFontStack contains no 'var('. PLATFORM_BRAND_CSS equals the light-mode \`--primary\` AND \`--brand\` declarations in app/globals.css (read the file with fs in the test, parse the :root block). Every KIT_HEADING_FONT_FILES path exists and starts with a TrueType signature (0x00010000 or 'true'). Every heading family used by any KIT_TYPE_PAIRINGS has an entry. normalizeLogoUrl: https/http kept, javascript:/data:/relative/empty/non-string → null. deriveBrandOutputs with an off-swatch brand keeps it (the plan gate lives in resolveSchoolTheme, not here).
2. tests/unit/school-brand.test.ts: vi.mock '@/lib/supabase/admin' (a chainable fake for from().select().eq().maybeSingle() and from().select().eq().in()) and '@/lib/plans/server' (hasPlanFeature). Cases: site_name + logo_url settings override tenants.name/logo_url; tenants columns used when settings absent; a non-http logo becomes null; theme row with an off-swatch brand and customBranding false → outputs use the theme's first swatch; with customBranding true → the custom brand; no theme row → theme null and platform outputs; a DB error → platform fallback without throwing. React cache() may memoise across calls with the same tenant id inside one test file — use distinct tenant ids per case.
3. Run npx vitest run tests/unit/brand-outputs.test.ts tests/unit/school-brand.test.ts and npx eslint on both files.`,
  },
]

const BEFORE_TASK = `UNIT: capture BEFORE artifacts of the app-rendered surfaces, BEFORE the certificate and OG agents start editing (they are waiting for you — be efficient, but be complete).
Owns: NEW scripts/qa-brand-outputs.ts; local DB fixture rows (local docker DB only); output directory ~/lms-765-qa/before/ (already contains emails/ — do not touch that folder).
1. Make sure the dev server answers on http://default.lvh.me:3005 (curl). If nothing listens on 3005, start it detached so it survives you: check package.json "dev" script, then e.g. \`nohup npm run dev -- -p 3005 > ${SCRATCH}/dev-3005.log 2>&1 &\` and poll until a page returns 200/307 (first compile can take minutes). Do not start a second server if one already runs.
2. Seed an idempotent QA fixture (local DB): a certificate for student@e2etest.com on the default tenant (Kódigo/Amarillo), course 1002 (no template → default design), verification_code 'QA765DEFAULT', template_id NULL. Inspect the certificates table columns and constraints first and fill required columns sensibly; use INSERT … ON CONFLICT DO NOTHING / a guard. Record the SQL inside the script (a --seed flag that runs it through docker exec psql) so the after-run can re-seed. The existing custom-template certificate QA764PUBLIC (code-academy) is the "custom unchanged" case.
3. Write scripts/qa-brand-outputs.ts (run with \`npx tsx scripts/qa-brand-outputs.ts --phase before|after [--seed]\`; follow scripts/qa-staff-theme-matrix.ts / scripts/qa-contact-sheet.ts conventions, playwright chromium, lvh.me:3005) that writes into ~/lms-765-qa/<phase>/app/:
   a. OG PNGs via HTTP GET (no browser needed): generic card and certificate card on default.lvh.me and code-academy.lvh.me using the exact query params the app itself produces (read lib/seo.ts, the root layout generateMetadata and verify/[code]/page.tsx generateMetadata), plus the course page OG: fetch http://default.lvh.me:3005/en/courses/1002 HTML, extract og:image, save the URL to a .txt and GET the image if it is an absolute URL (make it hit port 3005 on the same host).
   b. Certificate HTML view for QA765DEFAULT and QA764PUBLIC (find the public view route under app/api/certificates/view/) → full-page screenshots.
   c. Certificate PDF for both (find how app/api/certificates/[id]/route.ts?format=pdf authorises; sign in with Playwright as the certificate's student or an admin of that tenant if needed, and reuse the context's cookies for the request) → save .pdf, then \`sips -s format png <pdf> --out <png>\` (macOS sips renders page 1) and keep both.
   d. Badge PNG if a route exposes it for these certificates (otherwise skip and say so).
   e. Verify pages /en/verify/QA765DEFAULT on default.lvh.me and /en/verify/QA764PUBLIC on code-academy.lvh.me → screenshots at 1280 wide, light mode.
   f. The certificate template editor preview as owner@e2etest.com on default.lvh.me for course 1002 (find the teacher/admin route that renders components/teacher/certificate-preview.tsx) → screenshot of the preview region.
   Each step must be independent: log and continue on failure, and write ~/lms-765-qa/<phase>/app/manifest.json listing every artifact with status and note.
4. Run it with --phase before --seed. Read a few of the PNGs to confirm they show real content (not login pages or error pages); fix the script until they do.
Never edit application source files. Return: summary, artifacts list with notes, how auth was handled, and anything the after-run must know.`

const BEFORE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    artifacts: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, ok: { type: 'boolean' }, note: { type: 'string' } }, required: ['path', 'ok', 'note'] } },
    dev_server: { type: 'string' },
    fixture: { type: 'string' },
    notes_for_after_run: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'artifacts', 'dev_server', 'fixture', 'notes_for_after_run'],
}

function implement(u) {
  return agent(`${CONTEXT}\n\nYOUR OWNERSHIP LIST: ${u.owns}\n\n${u.resume ? u.resume + '\n\n' : ''}${u.task}\n\nReturn the structured report. files_changed must list every file you created or modified.`,
    { label: `impl:${u.key}`, phase: 'Implement', schema: IMPL_SCHEMA, model: 'sonnet', effort: 'high' })
}

function verify(u, impl) {
  return agent(`${CONTEXT}\n\nYou are the ADVERSARIAL VERIFIER for unit "${u.key}". Another agent implemented it; your job is to FALSIFY their work. Do not edit any file (read, grep, run tests/tsc/eslint/curl, write scratch scripts only under ${SCRATCH}/verify-${u.key}/).
Ownership list they had: ${u.owns}
Task they were given:\n${u.task}\n
Their report:\n${JSON.stringify(impl, null, 1)}\n
Check, with evidence: every instruction in the task was done (not just claimed); DECISIONS D1–D4 hold; no file outside the ownership list was edited by them (git diff --stat and compare with files_changed; other agents own other files, so only flag files in THIS unit's domain); no oklch()/var(--…) leaks into email HTML, PDF styles, canvas or satori styles; no HTML injection (escape every interpolated brand/school string); brand resolved from a trusted tenant id, never request params; no N+1 brand lookups in bulk loops; custom certificate templates render exactly as before (diff the old code path); existing callers still type-check and behave; tests actually assert the behaviour (re-run them) and would fail on the old code; error paths never throw into the main operation (an email or certificate must still go out if branding fails). Look for missed call sites with grep. Severity: high = wrong output/security/crash/regression, medium = spec miss or weak test, low = polish. Only report real, evidenced problems.`,
    { label: `verify:${u.key}`, phase: 'Verify', schema: FINDINGS_SCHEMA, model: 'sonnet', effort: 'xhigh' })
}

function repair(u, impl, review) {
  const real = (review?.findings || []).filter(f => f.severity !== 'low' || /trivial|one-line|rename|comment/i.test(f.fix))
  if (!real.length) return Promise.resolve({ summary: 'no findings to repair', files_changed: [], decisions_taken: [], tests_run: [], contract_issues: [], needs_outside_change: [], open_questions: [] })
  return agent(`${CONTEXT}\n\nYOUR OWNERSHIP LIST: ${u.owns}\n\nYou are the REPAIR agent for unit "${u.key}". The implementer's report:\n${JSON.stringify(impl, null, 1)}\n\nAn adversarial verifier found these problems:\n${JSON.stringify(real, null, 1)}\n\nFor each finding: confirm it against the code first (a verifier can be wrong — if it is wrong, say why in decisions_taken and skip it); otherwise fix it within your ownership list. Then re-run the unit's tests, tsc (own files) and eslint (own files). Original task for reference:\n${u.task}`,
    { label: `repair:${u.key}`, phase: 'Repair', schema: IMPL_SCHEMA, model: 'sonnet', effort: 'high' })
}

async function runUnit(u) {
  const impl = u.skipImpl
    ? { summary: 'Implemented in a previous session (tests/unit/brand-outputs.test.ts, tests/unit/school-brand.test.ts); report lost. Verify from the files.', files_changed: ['tests/unit/brand-outputs.test.ts', 'tests/unit/school-brand.test.ts'], decisions_taken: [], tests_run: [], contract_issues: [], needs_outside_change: [], open_questions: [] }
    : await implement(u)
  if (!impl) return { key: u.key, impl: null }
  const review = await verify(u, impl)
  const fix = await repair(u, impl, review)
  return { key: u.key, impl, review, fix }
}

// Resume run (2026-09-17 PM): before-capture finished last session (~/lms-765-qa/before/app/manifest.json,
// fixture QA765DEFAULT seeded, dev server up on 3005), so every unit starts now.
phase('Implement')
const units = await Promise.all(UNITS.map(u => runUnit(u)))
return { units }
