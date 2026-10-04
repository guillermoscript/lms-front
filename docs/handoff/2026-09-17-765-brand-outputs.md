# Handoff — #765 brand outputs (theme kit phase 5), 2026-09-17

Branch `feat/theme-kit-brand-outputs-765` (main tree). Nothing committed yet. Plan posted on #765 (copy: `docs/handoff/765/plan.md`).

## Owner decisions (2026-09-17)
- Scope: #765 only. #773 / #774 stay follow-ups.
- Schools with no theme row: platform teal `#007595` (`--primary`), not Estructura.
- Work in the main tree, not a worktree.

## Done by the orchestrator (final contract; agents must not edit)
- `lib/themes/brand-outputs.ts`: `deriveBrandOutputs(theme|null)` returns hex on white paper. Every swatch clears AA (probe: `docs/handoff/765/probe-brand.ts.txt`).
- `lib/themes/school-brand.ts`: `getSchoolBrand(tenantId)`.
- `lib/themes/brand-fonts.ts`.
- `public/fonts/kit/*.ttf` (400 and 700) plus the OFL licences.

## Binding decisions for implementers
The full text is inside the workflow script (`CONTEXT` + `UNITS`): `.claude/workflows/implement-765-brand-outputs.js`.
- **Emails:** the 7 school templates take a required `brand: SchoolBrand`. The 6 platform billing templates are untouched.
- **Certificates:** a design whose colours were never customised (no template, or a template with a logo or signature only) takes the brand and heading font. Custom colours render exactly as today. No school logo on certificates.
- **OG:**
  - the tenant comes from `x-tenant-id`
  - colours come only from the brand outputs
  - the logo goes through a guarded fetch helper in `lib/og/fetch-image.ts`
  - new `type=course&courseId=` card; the courses page always uses it
  - `s-maxage` 3600

## Workflow state when the owner left (~05:07)
Implementation workflow `wf_cbe4094d-5ee` (task `wekzskl5o`) was still running:
- **before-capture:** running. Writes `scripts/qa-brand-outputs.ts`, seeds `QA765DEFAULT`, and saves artifacts to `~/lms-765-qa/before/app/`. Email before-HTML is already in `~/lms-765-qa/before/emails/`.
- **emails:** implementing. Template and caller edits are visible in `git status`.
- **contract-tests:** implemented. Verify was running.
- **certificates** and **og:** wait for before-capture, then implement → verify → repair.

If the session died mid-run:
1. Check each unit with `git status` / `git diff`. The ownership lists are in the script.
2. Re-run only the unfinished units. Edit the script's `UNITS` list and launch it with `Workflow({ scriptPath: ".claude/workflows/implement-765-brand-outputs.js" })`.
3. `resumeFromRunId` works only in the same session.

## Next steps after the implementation workflow
1. Read every unit's report, answer `contract_issues` / `needs_outside_change` / `open_questions` yourself.
2. Second workflow: QA-after with `scripts/qa-brand-outputs.ts --phase after`, plus email PNGs (Andina/Verde andino, Kódigo/Amarillo, platform) and before/after contact sheets. Then multi-lens review (security: SSRF + escaping + tenant isolation; correctness vs acceptance; regressions; tests) → adversarial verify → repair.
3. `npm run build`. Check `.next/standalone` plus Dockerfile: `public/` is copied, so the fonts ship.
4. Commit named paths only (never `git add -A`). Do NOT commit `.claude/workflows/` or `docs/handoff/765/survey-raw.json` unless wanted.
5. PR via ship-pr + ui-evidence. Then file follow-ups:
   - Supabase Auth emails unbranded
   - invoice HTML uses env `COMPANY_NAME`
   - `favicon_url` never rendered
   - MCP widgets read frozen `tenants.primary_color` (blocks the column drop)

## Local facts
- Dev server `lvh.me:3005`.
- `default` tenant: Kódigo/Amarillo, starter plan.
- `code-academy` tenant: no theme, enterprise plan.
- Custom template certificate: `QA764PUBLIC`.
- PDF → PNG: `sips -s format png x.pdf --out x.png`.
- The survey of all surfaces with file:line evidence is in `docs/handoff/765/survey.md`.

## Resume run (2026-09-17 PM)
- Morning run `wf_cbe4094d-5ee` died with the session. before-capture + contract-tests had finished; emails had steps 1–4 but no `email-school-brand.test.ts`.
- Docker + local Supabase restarted (data intact: QA765DEFAULT, QA764PUBLIC). Dev server: `npx next dev -p 3005`, logs in the session scratchpad.
- Relaunched `wf_113651a3-6b8` (task `wv45ea343`): the script now skips before-capture, finishes emails (`resume` note), verify-only for contract-tests (`skipImpl`), and runs full certificates + og.
- `wf_113651a3-6b8` finished (emails, certs, OG done + verified + repaired). Orchestrator then: removed the `LEGACY_CUSTOM_PDF_PRIMARY` shim (custom PDFs now use their own primary colour; the old green was a camelCase bug), preview h1 no longer forces Georgia on custom templates, `lib/og/fetch-image.ts` resolves DNS in production and rejects private addresses + CGNAT. tsc clean, 1758 unit tests pass, no new lint errors.
- Phase 2 launched: `.claude/workflows/qa-review-765-brand-outputs.js` run `wf_a4c6104f-b57` (task `wio3370n1`): QA-after + sheets in `~/lms-765-qa/{after,sheets}`, 3 review lenses → verify → repair. Then: build, commit named paths, PR.
