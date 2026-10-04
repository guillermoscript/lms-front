## Plan

### Root cause
Emails, certificates and share images are rendered outside the browser, so the theme kit's CSS variables never reach them. Each one hardcodes its own palette instead:
- **Emails:** `#2563eb` in the 7 templates a school sends to its students.
- **Certificates:** four different defaults: `#3B82F6` in the design baseline, green `#1a5632` in the PDF and HTML view, `#1a73e8` in the badge, and Georgia in the editor preview. The PDF uses Helvetica.
- **Share images:** `/api/og` is purple for every school and ignores the tenant.

The engine can't be reused as it is. `deriveKitVars()` emits the button ink as `oklch()`, which mail clients, `@react-pdf`, node-canvas and satori can't read. The kit fonts ship only as next/font WOFF2 build output, which these renderers can't load either.

### Approach
1. **Shared contract**
   - `deriveBrandOutputs(theme)` (pure) turns a plan-resolved theme into literal `#RRGGBB` values designed on white paper: brand, button and button ink, brand text, tint, and a deep shade with its ink. All pairs clear AA.
   - `getSchoolBrand(tenantId)` loads the brand from any server context (actions, webhooks, cron). It applies the layout's `site_name`/`logo_url` overrides and the `custom_branding` gate, and never throws.
   - Static OFL TTFs for the four heading families go in `public/fonts/kit/`.
   - A school with no theme uses the platform teal (`--primary`), the same colour the app renders.
2. **Emails:** the 7 school templates take a required `brand` and get:
   - the school logo
   - brand-coloured headings in the heading font stack
   - AA buttons

   Callers resolve the brand once per event. The 6 platform billing emails stay platform-branded.
3. **Certificates:** a design whose colours were never customised takes the school brand and heading font. This covers no template, and a template that only adds a logo or signature. It applies to the PDF (`Font.register`), the HTML view (`@font-face`), the badge (`registerFont`), the verify page and the editor preview. Templates with custom colours render exactly as today.
4. **Share images:** `/api/og` resolves the tenant from `x-tenant-id` and paints its card from the brand: deep brand gradient, heading font, and the logo fetched through a guarded fetcher (https only, no private IPs, type and size caps, timeout). A new course card uses the course thumbnail next to the brand panel, and course pages always use it.

### Risks
- **Logo fetch:** the server now fetches an admin-typed logo URL, which is the SSRF surface. The fetcher validates every redirect hop and fails closed.
- **Stored PDFs:** they are snapshots, so a certificate issued before a brand change keeps the old colours. The on-demand PDF follows the new brand.
- **Share-image cache:** `s-maxage` drops from 24h to 1h so brand changes propagate.
- **Out of scope** (follow-ups):
  - Supabase Auth emails (need a Send Email hook)
  - invoice HTML branding
  - `favicon_url`, which is stored but never rendered
  - MCP widgets still read the frozen `tenants.primary_color`, so the column drop waits for them

### Test plan
- **Unit:**
  - every theme × swatch output is hex and clears AA
  - `--primary` in `globals.css` stays in step with the platform constant
  - `getSchoolBrand` overrides, plan gate and error fallback
  - each email template carries the brand values with no `oklch(`/`var(--`, and the platform billing templates are unchanged
  - certificate design resolver branches
  - OG palette contrast and fetch guard cases
- **QA (screenshots):**
  - emails in Andina/Verde andino, Kódigo/Amarillo and the platform palette
  - default-design certificate PDF, HTML view and verify page, before and after
  - a custom template unchanged
  - generic, certificate and course share cards for a themed school and an unthemed one
