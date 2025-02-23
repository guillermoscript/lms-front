'use server'
import 'server-only'

import { openai } from '@ai-sdk/openai'
import { generateId } from 'ai'
import { createAI, getMutableAIState, streamUI } from 'ai/rsc'
import dayjs from 'dayjs'
import { z } from 'zod'

import ChatLoadingSkeleton from '@/components/dashboards/chat/ChatLoadingSkeleton'
import Message from '@/components/dashboards/Common/chat/Message'
import AIResponseDisplay from '@/components/dashboards/student/account/AIResponseDisplay'
import DynamicQuestionForm from '@/components/dashboards/student/account/DynamicQuestionForm'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import { createClient } from '@/utils/supabase/server'

import { ClientMessage, Message as MessageType } from './ExamPreparationActions'
import { google } from '@ai-sdk/google'

const AIResponseSchema = z.object({
    learningOverview: z
        .string().describe('A summary of the user\'s ideal learning environment and methods.'),
    learningStrategies: z
        .array(
            z.object({
                strategy: z.string().describe('A specific suggestion for optimizing the user\'s learning experience.'),
                description: z
                    .string()
                    .min(1, 'Description must be at least 1 word long.')
                    .describe('A brief description of the strategy.'),
            })
        )
        .min(5, 'At least 5 strategies are required.')
        .describe('A list of specific suggestions for optimizing the user\'s learning experience.'),
    psychologicalProfile: z.object({
        traits: z.array(
            z.object({
                trait: z.string().describe('A personality trait of the user.'),
                level: z.enum(['low', 'medium', 'high']).describe('The level of the trait.'),
            })
        ).describe('A list of personality traits of the user.'),
        motivationFactors: z.array(z.string()).describe('A list of factors that motivate the user.'),
        preferredLearningStyle: z.enum([
            'Visual',
            'Auditory',
            'Reading/Writing',
            'Kinesthetic',
        ]).describe('The user\'s preferred learning style.'),
    }).describe('The user\'s psychological profile.'),
    learningEnvironment: z.object({
        structurePreference: z.enum(['Structured', 'Flexible']).describe('The user\'s preference for structured or flexible learning.'),
        groupPreference: z.enum(['Individual', 'Group']).describe('The user\'s preference for individual or group learning.'),
        idealStudyTime: z.string()
            .describe('The user\'s ideal study time of the day.')
    }).describe('The user\'s ideal learning environment.'),
    potentialChallenges: z.array(
        z.object({
            challenge: z.string().describe('A potential challenge the user might face.'),
            mitigationStrategy: z.string().describe('A suggestion to mitigate the challenge.'),
        }).describe('A list of potential challenges the user might face and suggestions to mitigate them.')
    ).describe('A list of potential challenges the user might face and suggestions to mitigate them.'),
    additionalInsights: z.array(z.string()).describe('Any valuable insight that doesn\'t fit into the other categories.'),
})

const QuestionToFulfillSchema = z.array(
    z.object({
        name: z.string().describe('The name of the input field.'),
        label: z.string().describe('The label of the input field.'),
        placeholder: z.string().describe('The placeholder of the input field.'),
        description: z.string().optional().describe('A description of the question.'),
        type: z.union([z.literal('text'), z.literal('number'), z.literal('select')]).describe('The type of the input field.'),
        options: z.array(z.string()).optional().describe('The options for a select input field.'),
    }).describe('The parameters for the input field.'),
).describe('The list of input fields to ask the user to fill out.')

export type QuestionToFulfill = z.infer<typeof QuestionToFulfillSchema>

export type AIKnowMeResponseData = z.infer<typeof AIResponseSchema>

export async function continueKnowMeChatConversation(
    input: string
): Promise<ClientMessage> {
    const aiState = getMutableAIState<typeof KnowMeChatAI>()

    const supabase = createClient()

    const userData = await supabase.auth.getUser()

    if (userData.error) {
        throw new Error('User not found')
    }

    console.log(input)

    // Update the AI state with the new user message.
    aiState.update({
        ...aiState.get(),
        messages: [
            ...aiState.get().messages,
            {
                id: generateId(),
                role: 'user',
                content: input,
            },
        ],
    })

    const result = await streamUI({
        model: google('gemini-2.0-pro-exp-02-05'),
        // model: openai('gpt-4o-mini'),
        messages: [
            ...aiState.get().messages.map((message: any) => ({
                role: message.role,
                content: message.content,
                name: message.name,
            })),
        ],
        temperature: 0.6,
        initial: (
            <Message
                sender={'assistant'}
                time={dayjs().format('dddd, MMMM D, YYYY h:mm A')}
                isUser={false}
            >
                <ChatLoadingSkeleton />
            </Message>
        ),
        system: `# IDENTITY

You are a highly intelligent AI designed to tailor educational experiences to individual needs.

# GOAL

Your goal is to analyze the user's learning preferences and provide insights to optimize their educational experience.

# INPUT

USER_DATA in  various Typescript tyoes:

type LearningPreferences = {
    favoriteLearningExperience: {
        description: string;
        effectiveAspects: string;
    };
    learningChallenge: {
        description: string;
        strategies: string;
    };
    preferTheoryOrPractice: {
        preference: 'theory' | 'practical examples';
        reason: string;
    };
    frustratingActivity: {
        description: string;
        frustrationReason: string;
    };
    importanceOfFeedback: {
        scale: string;
        example: string;
    };
};

type Question = {
    name: string;
    label: string;
    placeholder: string;
    description?: string;
    type: "text" | "number" | "select";
    options?: string[]; // Only for 'select' type questions
}[]'

# TASKS

1. Analyze the JSONd inputd to understand the user's learning style, methods, preferences, and challenges.
2. Determine the user's ideal learning environment based on their input.
3. Identify any potential challenges the user might face based on their preferences and make suggestions to mitigate them.
4. Provide a personalized learning strategy catering to the user's preferences and goals.

# OUTPUT

- Messages inside [] means that it's a UI element or a user event. For example:
  - [responseForUserInitialMessage] means that the response is generated by the responseForUserInitialMessage tool.
  - [askForUserInput] means that the assistant is asking the user for input.

# OUTPUT INSTRUCTIONS
    
- Offer insights into how to tailor the learning material (videos, readings, exercises) to their preferences.
- Suggest study habits and routines that align with their stated preferences and constraints.
- Address any potential challenges (e.g., low tech confidence) and how to overcome them.
- Be positive and encouraging, focusing on enabling the user to succeed.`,
        text: async function * ({ content, done }) {
            if (done) {
                aiState.done({
                    ...aiState.get(),
                    messages: [
                        ...aiState.get().messages,
                        {
                            id: generateId(),
                            role: 'assistant',
                            content,
                        },
                    ],
                })

                yield <ChatLoadingSkeleton />

                const aiMessageInsert = await supabase.from('messages').insert({
                    chat_id: +aiState.get().chatId,
                    message: content,
                    sender: 'assistant',
                    created_at: new Date().toISOString(),
                })

                console.log(aiMessageInsert)
            }

            return (
                <Message
                    sender={'assistant'}
                    time={dayjs().format('dddd, MMMM D, YYYY h:mm A')}
                    isUser={false}
                >
                    <ViewMarkdown markdown={content} />
                </Message>
            )
        },
        toolChoice: 'required',
        tools: {
            responseForUserInitialMessage: {
                description: "The response to the user's initial message.",
                parameters: AIResponseSchema,
                generate: async function ({
                    learningOverview,
                    learningStrategies,
                    psychologicalProfile,
                    learningEnvironment,
                    potentialChallenges,
                    additionalInsights,
                }: AIKnowMeResponseData) {
                    const toolCallId = generateId()

                    aiState.done({
                        ...aiState.get(),
                        messages: [
                            ...aiState.get().messages,
                            {
                                id: generateId(),
                                role: 'assistant',
                                content: [
                                    {
                                        type: 'tool-call',
                                        toolName: 'showExamForm',
                                        toolCallId,
                                        args: {
                                            learningOverview,
                                            learningStrategies,
                                            psychologicalProfile,
                                            learningEnvironment,
                                            potentialChallenges,
                                            additionalInsights,
                                        }
                                    }
                                ]
                            },
                            {
                                id: generateId(),
                                role: 'tool',
                                content: [
                                    {
                                        type: 'tool-result',
                                        toolName: 'showExamForm',
                                        toolCallId,
                                        result: {
                                            learningOverview,
                                            learningStrategies,
                                            psychologicalProfile,
                                            learningEnvironment,
                                            potentialChallenges,
                                            additionalInsights,
                                        }
                                    }
                                ]
                            }
                        ]
                    })

                    console.log(input)

                    const data = {
                        learningOverview,
                        learningStrategies,
                        psychologicalProfile,
                        learningEnvironment,
                        potentialChallenges,
                        additionalInsights,
                    }

                    const getProfile = await supabase.from('profiles').select('data_person').eq('id', userData.data.user.id).single()

                    const profileUpdate = await supabase.from('profiles').update({
                        data_person: {
                            // @ts-expect-error
                            ...getProfile.data.data_person,
                            learningOverview,
                            learningStrategies,
                            psychologicalProfile,
                            learningEnvironment,
                            potentialChallenges,
                            additionalInsights,
                        },
                    }).eq('id', userData.data.user.id)

                    console.log(profileUpdate)

                    return (
                        <AIResponseDisplay
                            data={data}
                            hideSubmit={true}
                        />
                    )
                }
            },
            askForUserInput: {
                description: 'Ask the new questions with the corresponding input fields so the user can fill them out and get more insights. this new questions will be unique to the user.',
                parameters: z.object({
                    fields: QuestionToFulfillSchema,
                }),
                generate: async function ({
                    fields
                }: { fields: QuestionToFulfill
                }) {
                    const toolCallId = generateId()

                    aiState.done({
                        ...aiState.get(),
                        messages: [
                            ...aiState.get().messages,
                            {
                                id: generateId(),
                                role: 'assistant',
                                content: [
                                    {
                                        type: 'tool-call',
                                        toolName: 'showExamForm',
                                        toolCallId,
                                        args: {
                                            fields
                                        }
                                    }
                                ]
                            },
                            {
                                id: generateId(),
                                role: 'tool',
                                content: [
                                    {
                                        type: 'tool-result',
                                        toolName: 'showExamForm',
                                        toolCallId,
                                        result: fields
                                    }
                                ]
                            }
                        ]
                    })

                    return (
                        <DynamicQuestionForm
                            questions={fields}
                            hideSubmit={true}
                        />
                    )
                }
            },
            responseForUserInput: {
                description: 'The response to the user\'s input.',
                parameters: z.object({
                    answers: z.array(z.object({
                        question: z.string().describe('The question for which the user provided an answer.'),
                        answer: z.string().describe('The user\'s answer to the question.'),
                        aiFeedback: z.string().describe('The AI feedback based on the user\'s answer.'),
                        aiInsight: z.string().optional().describe('The AI insight based on the user\'s answer.'),
                        aIRecommendation: z.string().optional().describe('The AI recommendation based on the user\'s answer.'),
                        aiPhychologicalProfile: z.string().optional().describe('The AI psychological profile based on the user\'s answer.'),
                    })).describe('The user\'s answers to the questions.'),
                    overallFeedback: z.string().describe('Overall feedback based on the user\'s answers.'),
                }),
                generate: async function ({
                    answers,
                    overallFeedback,
                }: {
                    answers: Array<{
                        question: string;
                        answer: string;
                        aiFeedback: string;
                        aiInsight?: string;
                        aIRecommendation?: string;
                        aiPhychologicalProfile?: string;
                    }>
                    overallFeedback: string
                }) {
                    const toolCallId = generateId()

                    aiState.done({
                        ...aiState.get(),
                        messages: [
                            ...aiState.get().messages,
                            {
                                id: generateId(),
                                role: 'assistant',
                                content: [
                                    {
                                        type: 'tool-call',
                                        toolName: 'showExamForm',
                                        toolCallId,
                                        args: {
                                            answers,
                                            overallFeedback,
                                        }
                                    }
                                ]
                            },
                            {
                                id: generateId(),
                                role: 'tool',
                                content: [
                                    {
                                        type: 'tool-result',
                                        toolName: 'showExamForm',
                                        toolCallId,
                                        result: {
                                            answers,
                                            overallFeedback,
                                        }
                                    }
                                ]
                            }
                        ]
                    })

                    return (
                        <div>
                            <h2>Answers</h2>
                            <ul>
                                {answers.map((answer) => (
                                    <li key={answer.question}>
                                        <h3>{answer.question}</h3>
                                        <p>
                                            <strong>User Answer:</strong> {answer.answer}
                                        </p>
                                        <p>
                                            <strong>AI Feedback:</strong> {answer.aiFeedback}
                                        </p>
                                        {answer.aiInsight && (
                                            <p>
                                                <strong>AI Insight:</strong> {answer.aiInsight}
                                            </p>
                                        )}
                                        {answer.aIRecommendation && (
                                            <p>
                                                <strong>AI Recommendation:</strong> {answer.aIRecommendation}
                                            </p>
                                        )}
                                        {answer.aiPhychologicalProfile && (
                                            <p>
                                                <strong>AI Psychological Profile:</strong> {answer.aiPhychologicalProfile}
                                            </p>
                                        )}

                                    </li>
                                ))}
                            </ul>
                            <h2>Overall Feedback</h2>
                            <p>{overallFeedback}</p>
                        </div>
                    )
                }
            }
        },
    })

    return {
        id: generateId(),
        role: 'assistant',
        display: result.value,
    }
}

interface AIState {
    chatId: string
    messages: MessageType[]
}

export const KnowMeChatAI = createAI<AIState, any >({
    actions: {
        continueKnowMeChatConversation,
    },
    initialUIState: [],
    initialAIState: { chatId: generateId(), messages: [] },
})

export const getUIStateFromKnowMeChatAIState = (aiState: any) => {
    return aiState.messages
        .filter((message) => message.role !== 'system')
        .map((message, index) => ({
            id: `${aiState.chatId}-${index}`,
            display:
                message.role === 'tool' ? null : message.role === 'user' &&
                  typeof message.content === 'string' ? (
                        <Message
                            sender={message.role}
                            time={dayjs().format('dddd, MMMM D, YYYY h:mm A')}
                            isUser={true}
                        >
                            <ViewMarkdown markdown={message.content} />
                        </Message>
                    ) : message.role === 'assistant' &&
                  typeof message.content === 'string' ? (
                            <Message
                                sender={message.role}
                                time={dayjs().format('dddd, MMMM D, YYYY h:mm A')}
                                isUser={false}
                            >
                                <ViewMarkdown markdown={message.content} />
                            </Message>
                        ) : null,
        }))
}
