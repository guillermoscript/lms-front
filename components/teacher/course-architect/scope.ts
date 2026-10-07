export type ArchitectScope =
    | { type: 'new' }
    | { type: 'course'; courseId: number }
    | { type: 'lesson'; lessonId: number; courseId?: number }
    | { type: 'exercise'; exerciseId: number; courseId?: number }
    | { type: 'exam'; examId: number; courseId?: number }

export function scopeCourseId(scope: ArchitectScope): number | null {
    return scope.type === 'new' ? null : (scope.courseId ?? null)
}

/** Pulls the new course id out of an MCP `lms_create_course` result. */
export function courseIdFromCreateResult(output: unknown): number | null {
    const o = output as
        | { structuredContent?: { id?: unknown }; content?: { type?: string; text?: string }[] }
        | undefined
    const direct = Number(o?.structuredContent?.id)
    if (Number.isInteger(direct) && direct > 0) return direct
    const text = o?.content?.find((c) => c?.type === 'text')?.text ?? ''
    const m = /\(ID:\s*(\d+)\)/.exec(text)
    return m ? Number(m[1]) : null
}
