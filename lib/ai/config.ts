import { openai } from '@ai-sdk/openai';

export const AI_CONFIG = {
    defaultModel: openai('gpt-5-mini'),
    maxDuration: 120,
    maxSteps: 10,
};

export const AI_MODELS = {
    tutor: openai('gpt-5-mini'),
    coach: openai('gpt-5-mini'),
    grader: openai('gpt-5-mini'),
    aristotle: openai('gpt-5-mini'),
};
