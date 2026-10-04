import { nanoid } from 'nanoid'
import { DEFAULT_MIN_STUDENT_TURNS, type StructuredRequirements } from '@/lib/ai/lesson-requirements'

/**
 * Maps the three seeded `lesson_task` system templates (#726) into the
 * structured task form (#806) — the "template → form mapping" the issue asks
 * for. `variables` are the values the teacher already typed into the
 * template wizard (e.g. `{{topic}}`, `{{language}}`), so the mapping carries
 * their input into the structured fields rather than restating the template.
 *
 * Only these three names are recognized (the same `is_system` rows
 * `systemTemplateMessageKey` translates for display). A teacher's own
 * template, or a template from another category, has no mapping — the caller
 * keeps the free-text fields the template wizard already fills.
 */
export function mapSystemTemplateToStructured(
    templateName: string,
    variables: Record<string, string>
): StructuredRequirements | null {
    const value = (key: string) => variables[key]?.trim() || `{{${key}}}`

    switch (templateName.trim()) {
        case 'Conversation Practice':
            return {
                level: value('language'),
                scenario: `Practice a natural conversation about ${value('topic')}.`,
                tutor_role: `Language tutor helping the student practice ${value('language')} conversation`,
                requirements: [
                    { id: nanoid(6), text: `Use correct grammar and vocabulary in ${value('language')}` },
                    { id: nanoid(6), text: `Stay on topic: ${value('topic')}` },
                    { id: nanoid(6), text: 'Complete at least 5-6 natural conversational exchanges' },
                ],
                min_student_turns: DEFAULT_MIN_STUDENT_TURNS,
            }
        case 'Comprehension Check':
            return {
                level: 'Any',
                scenario: `Check the student's understanding of ${value('concept')}.`,
                tutor_role: 'Patient tutor verifying comprehension through questions',
                requirements: [
                    { id: nanoid(6), text: `Explain ${value('concept')} in their own words` },
                    { id: nanoid(6), text: 'Answer 2-3 clarifying follow-up questions correctly' },
                ],
                min_student_turns: DEFAULT_MIN_STUDENT_TURNS,
            }
        case 'Writing Practice':
            return {
                level: 'Any',
                scenario: `Write a ${value('length')} text about ${value('topic')}.`,
                tutor_role: 'Writing coach giving structured, encouraging feedback',
                requirements: [
                    { id: nanoid(6), text: 'Proper structure (introduction, body, conclusion where relevant)' },
                    { id: nanoid(6), text: 'Correct grammar and spelling' },
                    { id: nanoid(6), text: `Meets the length requirement (${value('length')})` },
                ],
                min_student_turns: DEFAULT_MIN_STUDENT_TURNS,
            }
        default:
            return null
    }
}
