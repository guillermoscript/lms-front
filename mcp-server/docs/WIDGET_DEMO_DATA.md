# Widget demo data & preview mode

Every MCP App widget in `resources/` has hand-written fixtures so you can look at
it — including its empty and edge states — with **no database, no seed data and
no OAuth login**.

## Run it

```bash
cd mcp-server
MCP_DEMO_WIDGETS=1 npm run dev
# → Inspector: http://localhost:3000/inspector?autoConnect=http%3A%2F%2Flocalhost%3A3000%2Fmcp
```

Pick any `lms_demo_*` tool, optionally set `variant`, hit **Execute**. The widget
renders in the response pane (the ⤢ button gives it the full pane).

Headless PNGs of every fixture:

```bash
./scripts/shoot-demo-widgets.sh dark    # → demo-shots/dark/<widget>--<variant>.png
./scripts/shoot-demo-widgets.sh light
```

## How the mode works

| Piece | File |
| --- | --- |
| The fixtures | `src/demo-data.ts` (`WIDGET_DEMOS`) |
| One `lms_demo_<widget>` tool per entry | `src/tools/demo.ts` |
| The gate: `MCP_DEMO_WIDGETS=1` **and** `NODE_ENV !== production` | `src/env.ts` → `demoWidgetsEnabled()` |

Three deliberate consequences of the flag, all dev-only:

1. **OAuth is not installed** (`index.ts`). Bearer auth on `/mcp` would 401 the
   inspector before any handler ran, and the whole point is rendering widgets
   without Supabase.
2. **Demo tools register before `installToolGuards()`**, so the role gate does
   not reject them (an inspector session with no login has no tenant role) and
   they never write to `mcp_audit_log`.
3. **`tools/list` shows only the 21 demo tools.** With no auth there is no role,
   so the existing policy filter hides everything else. Real tools still refuse
   to run — `LmsSession.fromContext` throws "Authentication required."

Widget→host calls (`useCallTool`) still fail in this mode: `lms_grade_review`,
`lms_complete_lesson` etc. are not reachable without a session. That is expected
— you are looking at rendering, not round-trips.

## School branding

Widgets pick up the tenant's **theme kit** brand the way the app does (issue
#779 — `tenants.primary_color` / `secondary_color` are gone, frozen since #763
and dropped by migration `20260917150000_drop_tenants_legacy_colors.sql`), so
a school's widgets match its dashboard.

- **Server** — `src/branding.ts` reads `tenant_settings.theme_preset` and the
  `custom_branding` plan feature (`get_plan_features` RPC) on the caller's
  RLS-scoped client, resolves the theme the same way the app does
  (`resolveSchoolTheme`), and derives literal colours with `deriveWidgetBrand()`
  (`views/shared/kit-brand.ts`, a mirror of `lib/themes/brand-outputs.ts`).
  Cached 5 min per tenant. `installToolGuards` (`src/register.ts`) attaches the
  result to the `_meta` of any result that has `structuredContent`, so every
  widget-rendering tool is themed without touching its handler.
- **Widget** — `views/shared/branding.tsx` reads it from `useWidget().metadata`
  and emits a `:root` ramp (`--brand-50 … --brand-950`, plus `--brand-ink` /
  `--brand-text`) derived from `button` (what the app's `--primary` resolves
  to) with `color-mix()`. Every widget renders `<Brand />` in both its pending
  and loaded branches.
- **Styling** — accents are `bg-[var(--brand-600)]`, `text-[var(--brand-400)]`, …
  With no theme kit (or no branding `_meta` at all) the component falls back to
  the platform teal — the same `deriveWidgetBrand(null)` colour the app itself
  defaults to.

Two constraints worth knowing before you touch this:

- **`resources/styles.css` is not part of the build.** `mcp-use dev/build`
  generates its own Tailwind entry per widget under `.mcp-use/<widget>/styles.css`
  and imports that; there is no CLI hook to add your own. `@theme`, `@utility`
  and plain rules put in `resources/styles.css` silently do nothing — which is
  why the ramp is CSS custom properties + arbitrary-value utilities rather than
  a `brand-600` theme colour.
- **Status colours stay semantic.** Green/amber/red mastery bars, `at risk` and
  `published` pills are meaning, not brand — they are deliberately not themed.

Preview any widget under a fake school with the `brand` argument on the demo
tools: `none` (default), `ocean`, `sunset`, `forest`.

> Until #570 this argument did nothing. `src/tools/demo.ts` computed the brand
> and named it in the output text but never attached it to the result's
> `_meta`, so every "branded" preview rendered the platform violet. It now
> passes it through `widget({ metadata })`, the same sideband the real server
> uses.

## Language

Widget chrome is en/es. The language comes from the host —
`useWidget().locale`, a BCP 47 tag (SEP-1865 `HostContext.locale`) — and
`resources/shared/i18n.tsx` turns it into a string table plus `Intl`
formatters. Only strings the widget owns are translated; course titles, lesson
titles and tags come out of the database in the school's own language and are
rendered verbatim.

The preview harness supplies **no** host locale, so everything would otherwise
render at the `"en"` default and the Spanish half would never be reviewable.
Pass `lang=es` (or `en`) to any demo tool to pin it:

```bash
npx mcp-use client screenshot --mcp http://localhost:3000/mcp \
  --tool lms_demo_school_overview variant=default lang=es \
  --width 1100 --height 800 --theme dark --output es.png
```

That rides the same `_meta` channel as branding (`lms/locale`, see
`src/locale.ts`). Nothing in production sets it — the host stays the source of
truth. The fixtures are deliberately Spanish, so `lang=es` is the combination
that matches a real school, and `lang=en` next to Spanish content is the
mismatch #570 was filed about.

## Editing fixtures

Fixtures must satisfy each widget's own `propsSchema`. When you change a widget
schema, update the fixture in the same commit: `src/demo-data.ts` is the only
committed example of each widget's payload, and the demo tool will throw on a
mismatch the moment you execute it.

Keep the awkward values. Null descriptions, comma-string `tags`, `0%`, ungraded
rows and unnamed students are in there on purpose — they are what the widgets
actually get, and they are what surfaces layout bugs.
