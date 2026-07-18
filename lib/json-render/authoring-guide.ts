/**
 * Landing-page authoring guidance appended to the json-render catalog's component list.
 *
 * The catalog's own `prompt()` is a generic json-render UI-builder prompt (JSONL / JSON-Patch /
 * $state / repeat / tabs) plus the AVAILABLE COMPONENTS list. For our use case we only want the
 * component list — this guide overrides the output format with the simple flat array spec our
 * bridge consumes, and coaches the model on producing a rich, well-structured, on-brand page
 * instead of a thin stub. Shared by the API route and the live-test script so they can't drift.
 * See docs/adr/0001-json-render-puck-landing-builder.md.
 */
/**
 * The format-agnostic half of the guide: how to compose a rich, on-brand page. Shared
 * verbatim with the MCP server's landing-page tools (mirrored into
 * mcp-server/src/landing/catalog-meta.generated.ts by the manifest codegen script), where
 * the output shape differs (MCP tool args, not OpenAI structured output) but the page
 * craft is identical.
 */
export const LANDING_PAGE_CRAFT_GUIDE = `HOW TO BUILD A GREAT LANDING PAGE:
1. Length & flow. Produce a COMPLETE page of 6–9 sections, not a stub. A strong default flow:
   HeroBlock → StatsBand (or AnimatedStats) → FeaturesGrid → ContentFeature → TestimonialGrid
   → PricingTable (if relevant) → FaqAccordion → CtaBanner. Adapt to the user's request.
2. Always open with HeroBlock and always close with CtaBanner (the final sign-up driver).
3. Prefer the rich marketing sections (HeroBlock, StatsBand, AnimatedStats, FeaturesGrid,
   ContentFeature, TestimonialGrid, PricingTable, TeamGrid, FaqAccordion, CtaBanner) over the
   bare primitives (Heading, TextBlock, ButtonBlock) — primitives are for one-off touches.
4. Write REAL, specific, benefit-driven copy in the page's language — concrete numbers in
   stats, full sentences in testimonials and FAQ answers, distinct feature titles. Never use
   placeholder text like "Feature" or "Lorem ipsum". Fill every array with 3+ rich items.
5. Theming: pick ONE tasteful brand accent and pass it as "accentColor" on blocks that accept
   it (HeroBlock.backgroundColor, FeaturesGrid/StatsCounter/FaqAccordion.accentColor) — use an
   OKLCH or hex value that fits the topic (e.g. a warm tone for photography). Keep it
   consistent across the page. Leave it out to inherit the tenant's default brand color.
6. Use real CTA hrefs: "/auth/sign-up" for sign-up, "/courses" to browse, "#features"/"#faq"
   for in-page anchors. Give the hero a primary AND secondary CTA.
7. Spacing: let blocks use their defaults; only set paddingY/marginY when a section needs more
   breathing room. Don't set every spacing prop on every block.

Use ONLY the documented component names and props.`

export const LANDING_AUTHORING_GUIDE = `OUTPUT SHAPE (override any other format above):
Ignore the JSONL / JSON-Patch / $state / repeat instructions above — they do not apply here.
Return ONE JSON object with two fields:
  • "root": the id of the FIRST section block.
  • "elements": an ARRAY of section blocks in top-to-bottom page order. Each item has
      "id" (unique string), "type" (a component name from the list), "propsJson" (a JSON
      object string of that block's props), and "children" (always []).
Sections are FLAT SIBLINGS — never nest a section inside another section's children.

${LANDING_PAGE_CRAFT_GUIDE} Output the single JSON object — nothing else.`
