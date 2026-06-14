# LMS MCP Server — migration spec (read fully before coding)

We are porting the old MCP server (`../mcp-server/src`, built on `@modelcontextprotocol/sdk`)
to **mcp-use** (`mcp-use/server`). Auth is now **Supabase OAuth 2.1** + **RLS-aware queries**.

## Golden rules
- Use `server.tool({...}, async (input, ctx) => ...)`, NOT `server.registerTool`.
- Tool config: `{ name, description, schema, annotations?, outputSchema?, widget? }`.
  `schema` is the Zod input (was `inputSchema`). Do NOT use `.strict()` — plain `z.object({...})`.
- Every handler returns a response helper — never a raw `{ content, structuredContent }` object.
- Never `throw` out of a handler; catch and `return errorResult(...)`.
- Keep tool **names identical** to the old server (e.g. `lms_list_courses`).
- Keep all table/column names, query logic, ownership checks EXACTLY as the source. Only the
  registration wrapper, the way we get the client/identity, and the return shape change.

## Getting identity + client (replaces the old `auth` param)
At the top of each handler:
```ts
import { LmsSession } from "../session.js";
// ...
let session: LmsSession;
try {
  session = LmsSession.fromContext(ctx);
} catch (err) {
  return errorResult(err instanceof Error ? err.message : String(err));
}
const supabase = session.getClient();
```
`LmsSession` exposes the SAME surface the old `auth` did:
`getClient()`, `getUserId()`, `getRole()`, `isAdmin()`, `getTenantId()`,
`verifyCourseOwnership(id)`, `verifyLessonOwnership(id)`, `verifyExamOwnership(id)`,
`verifyExerciseOwnership(id)`, `verifyQuestionOwnership(id)`.
So old `auth.getClient()` → `session.getClient()`, `auth.verifyCourseOwnership(x)` →
`session.verifyCourseOwnership(x)`, etc. The verify* methods throw — keep them inside the try.

Wrap the WHOLE body in one try/catch returning `errorResult` (same as source did).

## Response helpers (from `../format.js`)
- `ok(structured, textContent)` — replaces `{ content:[{type:'text',text}], structuredContent }`.
  Pass the old `structuredContent`/`output` object as `structured`, the old text as `textContent`.
- `okText(textContent)` — when the old return had only text and no structuredContent.
- `errorResult(message)` — replaces the old `errorResult` (already prefixes "Error: ").
- `ResponseFormat` enum + `PaginationSchema` (spreadable `{limit, offset, response_format}`) also live in `../format.js`.
  Reuse them instead of redefining.

## Imports
```ts
import { z } from "zod";
import type { MCPServer } from "mcp-use/server";
import { widget, text } from "mcp-use/server"; // only if the file has widget tools
import { LmsSession } from "../session.js";
import { ok, okText, errorResult, ResponseFormat, PaginationSchema } from "../format.js";
```
Each file exports `export function registerXTools(server: MCPServer) { ... }` (no `auth` param now).

## Widget tools (only the 4 below)
Four read tools render a visual widget. For these, the tool config gets a `widget` block and the
handler returns `widget({ props, output })` (no `response_format` branching — drop that param from
their schema; keep other params). `output` is `text(<concise summary>)` (what the model reads).
`props` MUST match the widget's prop schema exactly (see below). Still do ownership checks first.

| Tool | widget.name | props shape (TypeScript) |
|------|-------------|--------------------------|
| `lms_list_courses` | `course-dashboard` | `{ status: string; total: number; courses: Array<{ id:number; title:string; description:string\|null; status:string; tags:string[]\|string\|null; lesson_count:number; enrollment_count:number; created_at:string; updated_at:string }> }` |
| `lms_get_course` | `course-detail` | `{ course:{ id:number; title:string; description:string\|null; status:string; tags:string[]\|string\|null; require_sequential_completion:boolean; enrollment_count:number; created_at:string }; lessons:Array<{id:number;title:string;sequence:number;status:string}>; exams:Array<{id:number;title:string;date:string\|null;duration:number;status:string}> }` |
| `lms_list_exam_submissions` | `exam-submissions` | `{ exam_id:number; total:number; submissions:Array<{ id:number; student_name:string; score:number\|null; submission_date:string; review_status:string\|null }> }` |
| `lms_get_lesson` | `lesson-preview` | `{ lesson:{ id:number; title:string; description:string\|null; video_url:string\|null; content:string\|null; status:string; sequence:number }; resources:Array<{ id:number; file_name:string; file_size:number\|null; mime_type:string\|null }> }` |

Widget tool example:
```ts
server.tool(
  {
    name: "lms_list_courses",
    description: "...",
    schema: z.object({ /* keep status/limit/offset, DROP response_format */ }),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    widget: { name: "course-dashboard", invoking: "Loading courses...", invoked: "Courses loaded" },
  },
  async (input, ctx) => {
    // session + ownership + query exactly as source
    return widget({
      props: { status: input.status ?? "all", total, courses },
      output: text(`Found ${total} course(s).`),
    });
  }
);
```

## Style
TypeScript strict. Keep `.describe()` on every schema field (copy from source). ESM imports end in `.js`.
