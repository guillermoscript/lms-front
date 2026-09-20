import { openai } from '@ai-sdk/openai';

// One id for the whole platform: change the default here. A reasoning model —
// it ignores `temperature` / `topP`, so call sites do not pass them.
export const DEFAULT_MODEL_ID = 'gpt-5.6-luna';
const defaultModel = openai(DEFAULT_MODEL_ID);

export const AI_CONFIG = {
    defaultModel,
    maxDuration: 120,
    maxSteps: 10,
    // Messages sent to the model as history, not persisted history — issue
    // #807. ~20 back-and-forths. Bounds token cost on a runaway conversation
    // while keeping a normal lesson-length one whole. Only what the model
    // SEES is capped: routes must keep passing the full, untrimmed transcript
    // to persistence and to verifyLessonCompletion (see capChatHistory in
    // lib/ai/chat-helpers.ts).
    maxHistoryMessages: 40,
};

export const AI_MODELS = {
    tutor: defaultModel,
    coach: defaultModel,
    grader: defaultModel,
    aristotle: defaultModel,
    starterCourse: defaultModel,
    questionGenerator: defaultModel,
};

export const DEFAULT_PASSING_SCORE = 70;
