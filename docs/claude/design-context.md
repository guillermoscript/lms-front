# Design context

> Moved verbatim from CLAUDE.md (index refactor). Loaded on demand — CLAUDE.md links here.

## Design Context

**Canonical source: [`PRODUCT.md`](PRODUCT.md) (strategy) + [`DESIGN.md`](DESIGN.md) (visual system).** Read PRODUCT.md before any UI work — it carries the register (`product`, with `(public)/*` and Puck blocks in `brand`), the four user groups, the anti-references, and the five design principles. The summary below is a pointer, not the authority.

Users span independent creators/solo educators and multi-staff schools, across LATAM and English-speaking markets (en/es). Brand personality: **minimal, elegant, focused** — content over chrome, no visual noise.

- **Aesthetic:** clean, spacious, content-first; hierarchy via typography weight/size over color/ornament. References: Duolingo/Khan Academy, Teachable/Thinkific. Anti-references: cluttered enterprise dashboards, generic Bootstrap.
- **Theme:** light + dark, tenant theming overrides primary/accent via CSS custom properties. The platform palette **is the theme kit's default theme** (#766): Estructura + **Tinta azul** `#3A50B8` (`oklch(0.476 0.166 270)`), same value in both modes, over Estructura's cool surfaces. `app/globals.css` holds `deriveKitVars('estructura', '#3A50B8')` verbatim — change it in `lib/themes/kit.ts` and paste, never by hand. Nothing may depend on that hue holding; tenants override it.
- **Typography/icons:** Noto Sans (body), Geist Sans/Mono (UI/code); Tabler Icons + Lucide (outline style).
- **Motion:** subtle, via `motion` lib; respect `prefers-reduced-motion`; convey state changes, not decoration.
- **Principles:** content over chrome · obvious over clever · consistent structure across tenants (brand via color/logo, not layout) · WCAG AA by default · progressive disclosure (sheets/dialogs for detail).
- **Stack:** Shadcn UI (base-mira, `@base-ui/react` primitives) · Tailwind v4 with OKLCH tokens · `motion` + `tw-animate-css` · `next-themes` + `TenantCssVarsServer` · `--radius: 0.625rem` base.

When reporting information to me, be extremely concise and sacrifice grammar for sake of concision.
