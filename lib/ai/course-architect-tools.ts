import { createMCPClient, type MCPClient } from '@ai-sdk/mcp'

export type ArchitectRole = 'teacher' | 'admin'

export function canUseCourseArchitect(role: string | null | undefined): role is ArchitectRole {
    return role === 'teacher' || role === 'admin'
}

export const ARCHITECT_READ_TOOLS = [
    'lms_list_courses',
    'lms_get_course',
    'lms_get_course_content',
    'lms_list_lessons',
    'lms_get_lesson',
    'lms_list_lesson_resources',
    'lms_list_mdx_components',
    'lms_list_templates',
    'lms_get_lesson_ai_task',
    'lms_list_exercises',
    'lms_get_exercise',
    'lms_list_exams',
    'lms_get_exam',
    'lms_get_plan_usage',
    'lms_list_course_categories',
    'lms_list_products',
    'lms_get_product',
] as const

export const ARCHITECT_WRITE_TOOLS = [
    'lms_create_course',
    'lms_update_course',
    'lms_publish_course',
    'lms_archive_course',
    'lms_create_lesson',
    'lms_update_lesson',
    'lms_update_lesson_content',
    'lms_publish_lesson',
    'lms_schedule_lesson',
    'lms_reorder_lessons',
    'lms_delete_lesson',
    'lms_delete_lesson_resource',
    'lms_reorder_lesson_resources',
    'lms_upsert_lesson_ai_task',
    'lms_create_exercise',
    'lms_update_exercise',
    'lms_duplicate_exercise',
    'lms_delete_exercise',
    'lms_create_artifact_exercise',
    'lms_update_artifact_exercise',
    'lms_create_exam',
    'lms_update_exam',
    'lms_delete_exam',
    'lms_add_exam_question',
    'lms_update_exam_question',
    'lms_delete_exam_question',
    'lms_create_product',
    'lms_update_product',
    'lms_archive_product',
    'lms_restore_product',
    'lms_generate_course_image',
    'lms_generate_lesson_image',
] as const

/** Admin-only on the MCP server (products RLS is admin-only); hidden from teachers here too. */
export const ARCHITECT_ADMIN_ONLY_TOOLS: readonly string[] = [
    'lms_list_products',
    'lms_get_product',
    'lms_create_product',
    'lms_update_product',
    'lms_archive_product',
    'lms_restore_product',
    'lms_archive_course',
]

export const ARCHITECT_MCP_TOOLS: readonly string[] = [...ARCHITECT_READ_TOOLS, ...ARCHITECT_WRITE_TOOLS]

/**
 * Tools that never execute without a human click: the server issues a signed
 * approval request and runs the tool only after the teacher approves it.
 * Destructive (delete/archive), visibility (publish/schedule) and money
 * (products) actions. Everything else is a reversible draft edit.
 */
export const ARCHITECT_APPROVAL_TOOLS: readonly string[] = [
    'lms_archive_course',
    'lms_delete_lesson',
    'lms_delete_lesson_resource',
    'lms_delete_exercise',
    'lms_delete_exam',
    'lms_delete_exam_question',
    'lms_publish_course',
    'lms_publish_lesson',
    'lms_schedule_lesson',
    'lms_create_product',
    'lms_update_product',
    'lms_archive_product',
    'lms_restore_product',
    // Costs money per call (image model), so the teacher approves each generation.
    'lms_generate_course_image',
    'lms_generate_lesson_image',
]

/** Same list, kept for the prompt builder. */
export const ARCHITECT_CONFIRM_FIRST_TOOLS = ARCHITECT_APPROVAL_TOOLS

/** Matches any tool that deletes, archives, publishes, unpublishes or restores, whether or not it is allowlisted today. */
export const RISKY_TOOL_PATTERN = /^lms_(delete|archive|publish|unpublish|restore|schedule)_/

/**
 * Update tools that can publish, archive or schedule through a field instead of
 * a dedicated tool, so gating only `lms_publish_*` would be bypassable via
 * `lms_update_course({ status: 'published' })`. Approval is required only when
 * the call actually touches visibility.
 */
export const ARCHITECT_VISIBILITY_FIELD_TOOLS: Record<string, readonly string[]> = {
    lms_update_course: ['status'],
    lms_update_exam: ['status'],
    lms_update_lesson: ['status', 'publish_at'],
    lms_create_lesson: ['publish_at'],
}

type ArchitectApproval = 'user-approval' | ((input: unknown) => 'user-approval' | undefined)

function visibilityApproval(fields: readonly string[]) {
    return (input: unknown): 'user-approval' | undefined => {
        const i = (input ?? {}) as Record<string, unknown>
        // draft is the safe state; anything else (published/archived/a schedule) needs a click.
        return fields.some((f) => i[f] !== undefined && i[f] !== null && i[f] !== '' && i[f] !== 'draft') ? 'user-approval' : undefined
    }
}

/** `streamText({ toolApproval })` policy: every risky tool needs a manual user approval. */
export function architectToolApproval(role: ArchitectRole): Record<string, ArchitectApproval> {
    const allowed = new Set(allowedArchitectToolNames(role))
    const policy: Record<string, ArchitectApproval> = Object.fromEntries(
        ARCHITECT_APPROVAL_TOOLS.filter((n) => allowed.has(n)).map((n) => [n, 'user-approval' as const]),
    )
    for (const [name, fields] of Object.entries(ARCHITECT_VISIBILITY_FIELD_TOOLS)) {
        if (allowed.has(name)) policy[name] = visibilityApproval(fields)
    }
    return policy
}

/** A successful call to one of these means the teacher's content changed, so the UI should refresh. */
export const CONTENT_CHANGING_TOOLS: readonly string[] = [...ARCHITECT_WRITE_TOOLS]

export function allowedArchitectToolNames(role: ArchitectRole): string[] {
    return role === 'admin' ? [...ARCHITECT_MCP_TOOLS] : ARCHITECT_MCP_TOOLS.filter((n) => !ARCHITECT_ADMIN_ONLY_TOOLS.includes(n) && !n.startsWith('lms_delete_'))
}

export function filterArchitectTools<T extends Record<string, unknown>>(tools: T, role: ArchitectRole): Partial<T> {
    const allowed = new Set(allowedArchitectToolNames(role))
    return Object.fromEntries(Object.entries(tools).filter(([name]) => allowed.has(name))) as Partial<T>
}

export function mcpServerUrl(): string {
    const base = (process.env.MCP_SERVER_URL || 'http://127.0.0.1:3001').replace(/\/+$/, '')
    return `${base}/mcp`
}

export function jwtTenantId(accessToken: string): string | null {
    try {
        const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8'))
        return (payload.tenant_id ?? payload.app_metadata?.tenant_id ?? null) as string | null
    } catch {
        return null
    }
}

/**
 * Opens an MCP client as the caller (their own Supabase token, so RLS and the
 * server's per-role tool policy apply) and returns only the authoring tools.
 * The caller must `await close()` when the stream ends, errors or aborts.
 */
export async function openArchitectTools(accessToken: string, role: ArchitectRole) {
    const client: MCPClient = await createMCPClient({
        transport: {
            type: 'http',
            url: mcpServerUrl(),
            headers: { Authorization: `Bearer ${accessToken}` },
        },
    })
    try {
        const all = await client.tools()
        return { tools: filterArchitectTools(all, role), close: () => client.close() }
    } catch (error) {
        await client.close().catch(() => {})
        throw error
    }
}
