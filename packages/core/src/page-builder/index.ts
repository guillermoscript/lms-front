/**
 * Page Architect shared core: the op protocol, the pure reducer, the AI block catalog,
 * validation and templates. Pure TS + zod, React-free; never imports `lib/puck/config.ts`.
 * Consumed by the web app (chat route, editor applier, save actions) and by mcp-server.
 */
export * from './types'
export * from './ops'
export * from './ids'
export * from './tree'
export * from './appends'
export * from './array-defaults'
export * from './apply-ops'
export * from './outline'
export * from './validate'
export * from './catalog'
export * from './bindings'
export * from './template-i18n'
export * from './templates'
export { PAGE_BUILDER_MANIFEST } from './generated/manifest.generated'
