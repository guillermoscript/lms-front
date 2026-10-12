# MCP server

> Moved verbatim from CLAUDE.md (index refactor).

`mcp-server/` exposes LMS course-management tools/resources/prompts/widgets to AI agents, built on **mcp-use** (not raw `@modelcontextprotocol/sdk`). **Read the `mcp-apps-builder` skill before touching it.** Runs standalone on port 3000 (`cd mcp-server && npm run dev`; `npm run mcp:build` from root). Auth is Supabase OAuth 2.1 — every query runs through a request-scoped, RLS-aware client using the caller's token (no service-role data access); role/tenant come from JWT claims, gated per-role in `src/tool-policy.ts`. In production, `app/api/mcp/[[...path]]/route.ts` fronts it at `https://<tenant>.<domain>/api/mcp`. Tool inventory lives in `mcp-server/src/tools/*.ts`, widgets in `mcp-server/views/<name>/view.tsx` — read those directly rather than relying on a list here, as they change frequently.
