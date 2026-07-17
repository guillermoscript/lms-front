import { openai } from '@ai-sdk/openai';

export const AI_CONFIG = {
    defaultModel: openai('gpt-4o-mini'),
    maxDuration: 120,
    maxSteps: 10,
};

export const AI_MODELS = {
    tutor: openai('gpt-4o-mini'),
    coach: openai('gpt-4o-mini'),
    grader: openai('gpt-4o-mini'),
    aristotle: openai('gpt-4o-mini'),
};

export const DEFAULT_PASSING_SCORE = 70;
