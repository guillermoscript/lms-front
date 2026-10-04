/**
 * Translating the built-in prompt templates (#726).
 *
 * The six `is_system` rows are seeded in English by
 * `20260131220100_seed_prompt_templates.sql`. Their text is data — an MCP tool
 * and the AI task builder both read it — so the rows keep their English
 * identity and only the teacher-facing list translates the display.
 *
 * A template a teacher wrote is their own words and is shown exactly as typed.
 */

/** Seeded template name → key under `dashboard.teacher.templates.system`. */
const SYSTEM_TEMPLATE_KEYS: Record<string, string> = {
  'Conversation Practice': 'conversationPractice',
  'Comprehension Check': 'comprehensionCheck',
  'Writing Practice': 'writingPractice',
  'Code Review Assistant': 'codeReviewAssistant',
  'Essay Evaluation': 'essayEvaluation',
  'Critical Thinking Grader': 'criticalThinkingGrader',
}

/** `prompt_templates.category` → key under `dashboard.teacher.templates.categories`. */
const CATEGORY_KEYS: Record<string, string> = {
  lesson_task: 'lessonTask',
  exercise: 'exercise',
  exam_grading: 'examGrading',
}

/** The message key for a seeded template, or `null` for a teacher's own. */
export function systemTemplateMessageKey(name: string | null | undefined): string | null {
  if (typeof name !== 'string') return null
  return SYSTEM_TEMPLATE_KEYS[name.trim()] ?? null
}

/** The message key for a category, or `null` for one this build does not know. */
export function templateCategoryMessageKey(category: string | null | undefined): string | null {
  if (typeof category !== 'string') return null
  return CATEGORY_KEYS[category.trim()] ?? null
}
