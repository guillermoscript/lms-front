export const meta = {
  name: 'qa-review-765-brand-outputs',
  description: 'QA-after artifacts + multi-lens review, adversarial verify and repair for #765 brand outputs',
  phases: [
    { title: 'QA + Review', detail: 'after artifacts and contact sheets; security, correctness, tests lenses' },
    { title: 'Verify', detail: 'adversarial check of every finding' },
    { title: 'Repair', detail: 'fix confirmed findings' },
  ],
}

const SCRATCH = '/private/tmp/claude-501/-Users-guillermomarin-Documents-GitHub-lms-front/dcd78b66-504e-4c3e-ac33-f69206496fb1/scratchpad'

const CONTEXT = `
Repo lms-front (cwd), branch feat/theme-kit-brand-outputs-765, GitHub issue #765 (theme kit phase 5): "What a school sends out (emails, certificates, share previews) carries its logo, brand color and heading font, not the platform's hardcoded palette."
Acceptance: (1) enrollment + invitation emails render in Andina/Verde andino and Kódigo/Amarillo; (2) the default certificate PDF uses the brand color and heading font, custom templates keep their own colours; (3) the course share image shows the school brand.

The implementation is DONE and uncommitted in the working tree (git status / git diff; new files are untracked). Run \`git status --short\` to see them. Contract modules: lib/themes/brand-outputs.ts (deriveBrandOutputs → hex outputs on white paper), lib/themes/school-brand.ts (getSchoolBrand(tenantId), service role, cache(), never throws), lib/themes/brand-fonts.ts. Surfaces: 7 school email templates + lib/email/templates/school-brand-parts.ts and their callers; certificates (lib/certificates/default-design.ts resolveCertificateDesign, pdf-generator.tsx, badge-generator.ts, lib/certificate-generator.ts HTML view, certificate routes, verify page, teacher preview); OG (app/api/og/route.tsx, lib/og/palette.ts, lib/og/fetch-image.ts, lib/seo.ts, courses/[id]/page.tsx generateMetadata).

Binding decisions (do not report these as bugs): no theme row → platform teal #007595 outputs and the renderer's current typeface; brand resolved server-side from a trusted tenant id (certificate row, action tenant, webhook tenant, proxy x-tenant-id), never query/body; outputs designed on white paper even for dark themes; status colours untouched; the 6 platform billing email templates untouched; no school logo on certificates; custom-colour certificate templates keep their colours — and the PDF now honours a custom template's primary_color (it used to ignore it and draw green because of a camelCase bug; fixing that is intentional, no legacy shim); OG s-maxage 3600; no backfill of stored PDFs (prod is a sandbox). OG fetch-image resolves DNS in production and rejects private addresses; DNS rebinding between lookup and fetch is accepted.

Rules: NEVER run git commands that change state (add, commit, stash, checkout, reset, restore). NEVER run npm run build / next build. NEVER stop/restart the dev server (http://default.lvh.me:3005 and http://code-academy.lvh.me:3005 — lvh.me, never localhost). NEVER touch the cloud DB or supabase-cloud MCP tools. NEVER post to GitHub/Slack. Local DB: \`docker exec supabase_db_lms-front psql -U postgres -At -c "..."\`. Tenant default (…0001, starter) = Kódigo/Amarillo kit theme; code-academy (…0002, enterprise) = no theme. Certificates: QA765DEFAULT (default tenant, course 1002, no template → school-branded), QA764PUBLIC (code-academy, custom template #1a5632/#0f2b1a). Accounts: student@e2etest.com, owner@e2etest.com (admin default), creator@codeacademy.com (admin code-academy), all password123. Scratch files only under ${SCRATCH}/.
`

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'short kebab slug, unique' },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          file: { type: 'string' },
          line: { type: 'number' },
          problem: { type: 'string' },
          evidence: { type: 'string', description: 'what you ran/read/saw that proves it' },
          fix: { type: 'string' },
        },
        required: ['id', 'severity', 'file', 'problem', 'evidence', 'fix'],
      },
    },
  },
  required: ['summary', 'findings'],
}

const QA_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    artifacts: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, ok: { type: 'boolean' }, note: { type: 'string' } }, required: ['path', 'ok', 'note'] } },
    contact_sheets: { type: 'array', items: { type: 'string' } },
    findings: FINDINGS_SCHEMA.properties.findings,
  },
  required: ['summary', 'artifacts', 'contact_sheets', 'findings'],
}

const QA_TASK = `ROLE: QA-after. Produce the "after" visual evidence and report any visual defect as a finding. Do NOT edit application source. You may edit scripts/qa-brand-outputs.ts and create new scripts under scripts/qa-* or ${SCRATCH}/qa/.
1. \`npx tsx scripts/qa-brand-outputs.ts --phase after\` → ~/lms-765-qa/after/app/ (same artifacts as ~/lms-765-qa/before/app/manifest.json). Fix the script if a step fails because of how it was written (not because of an app bug — that is a finding).
2. Course card with a thumbnail: no seeded course has thumbnail_url. Temporarily set course 1002's thumbnail_url to an image the dev server serves over http (find a .png/.jpg under public/, e.g. \`find public -name '*.png' -o -name '*.jpg' | head\`; use http://default.lvh.me:3005/<path>), capture /api/og?type=course&courseId=1002 on default.lvh.me as og-course-1002-thumb.png, then RESTORE thumbnail_url to its original value (read it first). Also capture og-course-1002.png without thumbnail (after restoring).
3. Emails AFTER: look at ~/lms-765-qa/before/render-before-emails.ts (renders HTML of the 8 email outputs). Write ~/lms-765-qa/after/render-after-emails.ts that renders the same templates with brands built by deriveBrandOutputs for Andina / Verde andino (#2F6B4F), Kódigo / Amarillo (#F2B705) and platform (null) — see lib/themes/kit.ts for exact StoredKitTheme shapes and tests/unit/email-school-brand.test.ts for how brands are built; include a logoUrl for one brand (use http://default.lvh.me:3005/<some public image>). Write HTML into ~/lms-765-qa/after/emails/<brand>/<template>.html, then screenshot every before and after HTML with playwright chromium (600px wide viewport, full page) to PNGs next to them.
4. Contact sheets: using scripts/qa-contact-sheet.ts conventions (read it), build side-by-side before|after sheets into ~/lms-765-qa/sheets/: emails (before vs Andina vs Kódigo vs platform, at least enrollment-confirmed and invitation, ideally all), certificates (HTML view, PDF png, verify page, editor preview; default + custom), OG (generic, certificate, course, course-thumb, both tenants).
5. LOOK at every after PNG and every sheet (Read tool). Report as findings: text illegible or low contrast, clipped/overflowing layout, wrong font (e.g. heading not in kit font where expected), custom template QA764PUBLIC colours not its own #1a5632/#0f2b1a, platform no-theme not teal, broken images, error pages, any purple left in OG, missing logo on OG when the tenant has a logo. Evidence = artifact path + what you see. Compare with before PNGs for unintended regressions.`

const LENSES = [
  {
    key: 'security',
    task: `LENS: security. Read-only (scratch scripts allowed). Check: SSRF in lib/og/fetch-image.ts and every place it is called (every hop validated, timeout covers body read, size cap real, content-type enforced, NODE_ENV gating sensible, logo/thumbnail URLs from DB only); /api/og tenant isolation — can a request on tenant A's host render tenant B's course/brand/unpublished course via query params (courseId, site, etc.)? what happens with no x-tenant-id (platform root domain)? can a caller spoof x-tenant-id past proxy.ts?; HTML/attribute injection in every email template (school name, logo URL, course titles, user-supplied strings — look at the full interpolations, not only brand ones) and in the certificate HTML view (lib/certificate-generator.ts @font-face / colours from design_settings — can a template's primary_color string inject CSS/HTML?); certificate routes: brand resolved from the certificate row, no auth regression vs HEAD (git diff the auth checks); service-role use in getSchoolBrand never leaks non-brand data; satori/react-pdf font path traversal (font family values come from a closed union?). Report only evidenced problems.`,
  },
  {
    key: 'correctness',
    task: `LENS: correctness and regressions. Read-only (scratch scripts allowed; you may curl the dev server and run npx tsx scripts under ${SCRATCH}/review/). Check each acceptance criterion end-to-end in code; every caller of changed signatures (ogImageUrl, buildPageMetadata, email templates, generateCertificateHTML, PDF/badge generators, CertificatePreview, certificate template context) still passes correct data; existing OG callers (root layout, products/[productId], p/[slug], verify/[code]) still work — curl them and check image/png; brand lookups not N+1 in bulk sends; an email/certificate still goes out if branding fails (getSchoolBrand never throws, font file missing → built-in font); resolveCertificateDesign schoolBranded logic (defaults case-insensitive, logo-only template still branded) and that the teacher editor preview matches what the PDF/HTML will render; heading font registration idempotent and not re-reading files per request; Next.js specifics: route runtime (node APIs like node:dns, fs in /api/og must run on the Node runtime, not edge), server/client boundaries (a server-only import like school-brand.ts or brand-fonts.ts reaching a 'use client' component would break the build — check components/teacher/* imports carefully), cache headers. Also \`npx tsc --noEmit -p tsconfig.json\`. Report only evidenced problems.`,
  },
  {
    key: 'tests',
    task: `LENS: test quality. Read-only (you may run tests and write mutation experiments ONLY as copies under ${SCRATCH}/review-tests/ — never modify repo files). New/changed tests: tests/unit/{brand-outputs,school-brand,email-school-brand,certificate-brand,og-palette,og-fetch-image,daily-digest-pagination,email-mailer-status}.test.ts. For each: would it fail if the behaviour regressed (e.g. revert a template to #2563eb, drop escaping, drop the private-DNS check, make resolveCertificateDesign treat a logo-only template as custom, remove the custom primary colour from the PDF)? Reason from the assertions; where cheap, prove it by running vitest against a patched copy via a scratch vitest config that aliases the module. Flag: missing coverage of an acceptance criterion; tests asserting implementation details that will break for no reason; tests hitting the network or real DB; env leakage between tests (vi.stubEnv without unstub, module-level cache() memoisation across cases). Run \`npm run test:unit\` once and report failures. Report only evidenced problems.`,
  },
]

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          real: { type: 'boolean' },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          reason: { type: 'string', description: 'evidence for the verdict' },
          fix: { type: 'string', description: 'the fix to apply if real (may refine the reviewer\'s)' },
        },
        required: ['id', 'real', 'severity', 'reason', 'fix'],
      },
    },
  },
  required: ['verdicts'],
}

const REPAIR_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    fixed: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, what: { type: 'string' } }, required: ['id', 'what'] } },
    skipped: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, why: { type: 'string' } }, required: ['id', 'why'] } },
    files_changed: { type: 'array', items: { type: 'string' } },
    tests_run: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, result: { type: 'string' } }, required: ['command', 'result'] } },
    needs_orchestrator: { type: 'array', items: { type: 'string' }, description: 'product decisions or out-of-scope issues' },
  },
  required: ['summary', 'fixed', 'skipped', 'files_changed', 'tests_run', 'needs_orchestrator'],
}

phase('QA + Review')
const [qa, ...reviews] = await parallel([
  () => agent(`${CONTEXT}\n\n${QA_TASK}`, { label: 'qa-after', phase: 'QA + Review', schema: QA_SCHEMA, model: 'sonnet', effort: 'high' }),
  ...LENSES.map(l => () => agent(`${CONTEXT}\n\n${l.task}`, { label: `review:${l.key}`, phase: 'QA + Review', schema: FINDINGS_SCHEMA, model: 'sonnet', effort: 'xhigh' })),
])

const all = [
  ...((qa && qa.findings) || []).map(f => ({ ...f, id: `qa-${f.id}`, lens: 'qa' })),
  ...reviews.flatMap((r, i) => ((r && r.findings) || []).map(f => ({ ...f, id: `${LENSES[i].key}-${f.id}`, lens: LENSES[i].key }))),
]
log(`findings: ${all.length} (${all.filter(f => f.severity !== 'low').length} medium+)`)

phase('Verify')
const verdict = all.length
  ? await agent(`${CONTEXT}\n\nROLE: adversarial verifier. Reviewers produced the findings below. For EACH, try to prove it wrong: read the code, re-run the evidence, check the binding decisions in the context (a finding that contradicts a binding decision is not real). Mark real=true only with concrete evidence; re-grade severity honestly (high = wrong output / security / crash / regression; medium = spec miss or weak test; low = polish). Give a precise fix for every real one. Read-only (scratch under ${SCRATCH}/verify/).\n\nFINDINGS:\n${JSON.stringify(all, null, 1)}`,
      { label: 'verify', phase: 'Verify', schema: VERDICT_SCHEMA, model: 'sonnet', effort: 'xhigh' })
  : { verdicts: [] }

const confirmed = ((verdict && verdict.verdicts) || []).filter(v => v.real && (v.severity !== 'low' || /trivial|one-line|rename|comment/i.test(v.fix)))
  .map(v => ({ ...all.find(f => f.id === v.id), verdict: v }))

phase('Repair')
const repair = confirmed.length
  ? await agent(`${CONTEXT}\n\nROLE: repair. Fix the confirmed findings below in the working tree (any #765 file; keep changes minimal, match surrounding style, comments explain why). No back-compat shims. If a fix needs a product decision, skip it and put it in needs_orchestrator. After fixing: \`npx tsc --noEmit -p tsconfig.json\`, \`npm run test:unit\`, eslint on the files you changed, and for visual fixes re-run the relevant part of \`npx tsx scripts/qa-brand-outputs.ts --phase after\` and Read the PNG.\n\nCONFIRMED:\n${JSON.stringify(confirmed, null, 1)}`,
      { label: 'repair', phase: 'Repair', schema: REPAIR_SCHEMA, model: 'sonnet', effort: 'high' })
  : null

return {
  qa: qa && { summary: qa.summary, contact_sheets: qa.contact_sheets, failed_artifacts: qa.artifacts.filter(a => !a.ok) },
  review_summaries: reviews.map((r, i) => ({ lens: LENSES[i].key, summary: r && r.summary })),
  rejected: ((verdict && verdict.verdicts) || []).filter(v => !v.real).map(v => ({ id: v.id, reason: v.reason })),
  low_unfixed: ((verdict && verdict.verdicts) || []).filter(v => v.real && !confirmed.find(c => c.id === v.id)),
  confirmed: confirmed.map(c => ({ id: c.id, severity: c.verdict.severity, problem: c.problem })),
  repair,
}
