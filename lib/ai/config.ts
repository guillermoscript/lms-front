import { openai } from '@ai-sdk/openai';

// One id for the whole platform: change the default here. A reasoning model —
// it ignores `temperature` / `topP`, so call sites do not pass them.
export const DEFAULT_MODEL_ID = 'gpt-5.6-luna';
const defaultModel = openai(DEFAULT_MODEL_ID);

export const AI_CONFIG = {
    defaultModel,
    maxDuration: 120,
    maxSteps: 10,
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
