/**
 * AI constants only. There is no model here and no provider import: every model
 * comes from the school's own key through `createTenantAi()`
 * (lib/ai/tenant-ai.ts). Which model a feature runs is the school's setting.
 */
export const AI_CONFIG = {
    maxDuration: 120,
    maxSteps: 10,
    // Building a whole course is one tool call per lesson/exercise/exam.
    courseArchitectMaxSteps: 30,
    // Messages sent to the model as history, not persisted history — issue
    // #807. ~20 back-and-forths. Bounds token cost on a runaway conversation
    // while keeping a normal lesson-length one whole. Only what the model
    // SEES is capped: routes must keep passing the full, untrimmed transcript
    // to persistence and to verifyLessonCompletion (see capChatHistory in
    // lib/ai/chat-helpers.ts).
    maxHistoryMessages: 40,
};

export const DEFAULT_PASSING_SCORE = 70;
