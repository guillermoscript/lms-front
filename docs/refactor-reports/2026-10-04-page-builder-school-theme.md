# Page builder style review

Reviewed master ca6225e5 and theme PRs #768 (font/corner tokens), #771 (public/Puck colors), #785 (remaining primitive colors), #787 (platform palette), and #786 (testimonial placeholders).

## Applied

Editor chrome, fonts, primary controls, fields, and canvas follow live school tokens. Shared Card/Image/Video blocks offer School theme corners by default, while explicit numeric radii and shadows remain supported. Automatic hover shadows and decorative lift/scale effects are removed. CTA containers use school corners; the legacy ShinyEyebrow block uses solid themed text. Default accent text uses contrast-safe brand-text.

CTA navigation uses semantic links with shared button variants. Repeated contact forms have unique associated control IDs and autocomplete. Catalog search is labeled and price filters expose pressed state and visible focus. Navigation underline effects animate transforms rather than width. AI guidance inherits school branding unless asked to override it; generated catalogs remain synchronized.

## Compatibility

Shared renderers affect all editor-created pages on deployment without rewriting content or requiring republishing. Saved values take precedence. Legacy numeric defaults are indistinguishable from deliberate choices, so remain overrides until the author selects School theme.

## QA

57 focused tests cover missing/saved values, explicit overrides, AI defaults, semantic CTAs, repeated contact forms, accent contrast, theme tokens, and the palette guard. Production build and full source typecheck pass with incremental caching disabled for verification. The standard incremental TypeScript cache serialization exhausts memory; the repository configuration is preserved. Local preview covers all four kits in light/dark, a custom hero color, corner changes (8px/2px/999px), Spanish form labels, and 360px width without overflow. Preview uses fallback fonts; next/font wiring is covered by token tests and the production build. No live page was saved or published. Comparison screenshots are available in the chat artifacts directory.

## Remaining findings

- ContactForm currently prevents submission and has no delivery implementation.
- Section's legacy Dark option inverts foreground/background by mode rather than forcing a consistently dark section. Changing it requires an explicit compatibility decision for authored pages.
- AnimatedStats still has example numbers as fallback defaults; NumberTicker needs dedicated reduced-motion handling.
- LogoMarquee stops under reduced motion and pauses during keyboard focus; a persistent pause control remains a follow-up.
