import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
    ARCHITECT_MCP_TOOLS,
    ARCHITECT_APPROVAL_TOOLS,
    CONTENT_CHANGING_TOOLS,
    RISKY_TOOL_PATTERN,
    architectToolApproval,
    allowedArchitectToolNames,
    canUseCourseArchitect,
    filterArchitectTools,
    jwtTenantId,
} from '@/lib/ai/course-architect-tools'
import { buildCourseArchitectPrompt } from '@/lib/ai/course-architect-prompt'

const toolsDir = join(__dirname, '../../mcp-server/src/tools')
const mcpSource = readdirSync(toolsDir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => readFileSync(join(toolsDir, f), 'utf8'))
    .join('\n')

describe('course-architect tool allowlist', () => {
    it('every allowlisted tool is registered in mcp-server/src/tools', () => {
        for (const name of ARCHITECT_MCP_TOOLS) {
            expect(mcpSource, name).toMatch(new RegExp(`"${name}"`))
        }
    })

    it('keeps only plain product-free native-tool-free names', () => {
        for (const name of ARCHITECT_MCP_TOOLS) expect(name).toMatch(/^lms_[a-z_]+$/)
    })

    it('includes the authoring tools', () => {
        for (const name of ['lms_create_course', 'lms_create_lesson', 'lms_update_lesson_content', 'lms_create_exercise', 'lms_create_exam', 'lms_add_exam_question', 'lms_publish_course', 'lms_get_course_content']) {
            expect(ARCHITECT_MCP_TOOLS).toContain(name)
        }
    })

    it('excludes student, community, certificate, member and landing tools', () => {
        const banned = /^lms_(my_|view_|complete_|browse_|enroll|.*community|.*certificate|.*landing|.*member|.*school_settings|set_school|grade_|ask_teacher|record_|.*study_plan|.*review)/
        for (const name of ARCHITECT_MCP_TOOLS) expect(name, name).not.toMatch(banned)
    })

    it('hides destructive tools from teachers, keeps them for admins', () => {
        const teacher = allowedArchitectToolNames('teacher')
        expect(teacher.some((n) => n.startsWith('lms_delete_') || n === 'lms_archive_course')).toBe(false)
        expect(allowedArchitectToolNames('admin')).toContain('lms_delete_lesson')
    })

    it('filters a fetched tool set down to the allowlist', () => {
        const filtered = filterArchitectTools({ lms_create_course: {}, lms_my_learning: {}, lms_create_community_post: {} }, 'teacher')
        expect(Object.keys(filtered)).toEqual(['lms_create_course'])
    })

    it('flags writes and the product tool as content-changing, not reads', () => {
        expect(CONTENT_CHANGING_TOOLS).toContain('lms_create_lesson')
        expect(CONTENT_CHANGING_TOOLS).toContain('lms_create_product')
        expect(CONTENT_CHANGING_TOOLS).not.toContain('lms_get_course')
    })
})

describe('course-architect role gate', () => {
    it('allows teacher and admin only', () => {
        expect(canUseCourseArchitect('teacher')).toBe(true)
        expect(canUseCourseArchitect('admin')).toBe(true)
        expect(canUseCourseArchitect('student')).toBe(false)
        expect(canUseCourseArchitect(null)).toBe(false)
    })
})

describe('course-architect helpers', () => {
    it('reads tenant_id from a JWT', () => {
        const payload = Buffer.from(JSON.stringify({ tenant_id: 'abc' })).toString('base64url')
        expect(jwtTenantId(`h.${payload}.s`)).toBe('abc')
        expect(jwtTenantId('garbage')).toBeNull()
    })
})

describe('course-architect prompt', () => {
    it('lesson scope pins the lesson and skips the interview', () => {
        const p = buildCourseArchitectPrompt({ scope: { type: 'lesson', lessonId: 42 }, locale: 'en', role: 'teacher' })
        expect(p).toContain('SCOPE: lesson 42')
        expect(p).toContain('lms_get_lesson')
        expect(p).toContain('Edit ONLY this lesson')
    })

    it('course scope reads the course content first', () => {
        const p = buildCourseArchitectPrompt({ scope: { type: 'course', courseId: 7 }, locale: 'en', role: 'teacher' })
        expect(p).toContain('lms_get_course_content with course_id 7')
    })

    it('new scope runs the confirm-before-build flow in the teacher locale', () => {
        const p = buildCourseArchitectPrompt({ scope: { type: 'new' }, locale: 'es', role: 'admin' })
        expect(p).toContain('Reply in Spanish')
        expect(p).toContain('Shall I build it?')
        expect(p).toContain('DRAFT')
        expect(p).toContain('lms_create_product')
    })

    it('teachers never see product tools and the prompt says admin only', () => {
        const teacher = allowedArchitectToolNames('teacher')
        expect(teacher.some((n) => n.includes('product'))).toBe(false)
        expect(allowedArchitectToolNames('admin')).toContain('lms_create_product')
        expect(buildCourseArchitectPrompt({ scope: { type: 'new' }, locale: 'en', role: 'teacher' })).not.toContain('lms_create_product')
    })

    it('teachers cannot create products', () => {
        const p = buildCourseArchitectPrompt({ scope: { type: 'new' }, locale: 'en', role: 'teacher' })
        expect(p).toContain('admin only')
    })
})

describe('course-architect tool approval', () => {
    it('covers every allowlisted destructive, publish, schedule and product-write tool', () => {
        for (const name of ARCHITECT_MCP_TOOLS) {
            if (RISKY_TOOL_PATTERN.test(name) || /^lms_(create|update)_product$/.test(name)) {
                expect(ARCHITECT_APPROVAL_TOOLS, name).toContain(name)
            }
        }
        for (const name of ARCHITECT_APPROVAL_TOOLS) expect(ARCHITECT_MCP_TOOLS, name).toContain(name)
    })

    it('never gates reads or plain draft edits', () => {
        for (const name of ['lms_get_course', 'lms_list_lessons', 'lms_create_lesson', 'lms_update_lesson_content']) {
            expect(ARCHITECT_APPROVAL_TOOLS).not.toContain(name)
        }
    })

    it('route policy marks risky tools user-approval, per role', () => {
        const admin = architectToolApproval('admin')
        expect(admin.lms_delete_lesson).toBe('user-approval')
        expect(admin.lms_create_product).toBe('user-approval')
        expect(Object.entries(admin).filter(([, v]) => v === 'user-approval').map(([k]) => k).sort()).toEqual([...ARCHITECT_APPROVAL_TOOLS].sort())
        const teacher = architectToolApproval('teacher')
        expect(teacher.lms_publish_lesson).toBe('user-approval')
        expect(teacher.lms_create_product).toBeUndefined()
        expect(teacher.lms_delete_lesson).toBeUndefined()
        // costly AI image generation needs approval for both roles
        expect(teacher.lms_generate_course_image).toBe('user-approval')
        expect(admin.lms_generate_lesson_image).toBe('user-approval')
    })

    it('field-based publish/archive/schedule via update tools needs approval', () => {
        const p = architectToolApproval('teacher') as Record<string, (i: unknown) => string | undefined>
        expect(p.lms_update_course({ course_id: 1, status: 'published' })).toBe('user-approval')
        expect(p.lms_update_course({ course_id: 1, status: 'archived' })).toBe('user-approval')
        expect(p.lms_update_course({ course_id: 1, title: 'x' })).toBeUndefined()
        expect(p.lms_update_exam({ exam_id: 1, status: 'published' })).toBe('user-approval')
        expect(p.lms_update_lesson({ lesson_id: 1, publish_at: '2030-01-01T00:00:00Z' })).toBe('user-approval')
        expect(p.lms_update_lesson({ lesson_id: 1, status: 'draft' })).toBeUndefined()
        expect(p.lms_create_lesson({ course_id: 1, title: 't', publish_at: '2030-01-01' })).toBe('user-approval')
    })

    it('prompt tells the model the UI asks for approval', () => {
        const p = buildCourseArchitectPrompt({ scope: { type: 'new' }, locale: 'en', role: 'admin' })
        expect(p).toContain('Approve / Deny')
        expect(p).toContain('do not ask for confirmation again')
    })
})
