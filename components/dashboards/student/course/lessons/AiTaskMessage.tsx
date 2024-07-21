import { generateId } from 'ai'

import { Message } from '@/actions/dashboard/AI/ExamPreparationActions'
import { getUIStateFromTaskAIState, TaskAiActions } from '@/actions/dashboard/AI/TaskAiActions'
import { Tables } from '@/utils/supabase/supabase'

export default async function AiTaskMessage({
    systemPrompt,
    lessonsAiTasks,
    lessonsAiTasksMessages,
    children,
    lessonId,
    userId,
}: {
    userId: string
    lessonId: string
    children: React.ReactNode
    systemPrompt: string
    lessonsAiTasks: Tables<'lessons_ai_tasks'>
    lessonsAiTasksMessages: Array<Tables<'lessons_ai_task_messages'>>
}) {
    // WTF!!!! why this need an await?????
    const uiState = await getUIStateFromTaskAIState({
        id: lessonsAiTasks.id.toString(),
        createdAt: new Date(lessonsAiTasks.created_at),
        messages: lessonsAiTasksMessages.map((message) => {
            if (!message) return null

            if (message.sender === 'tool') {
                return ({
                    id: message.id,
                    role: message.sender,
                    content: JSON.parse(message.message)
                })
            }

            if (message.sender === 'assistant') {
                // if the content is a json stringified object then parse it
                if (message.message.startsWith('{') || message.message.startsWith('[')) {
                    return ({
                        id: message.id,
                        role: message.sender,
                        content: JSON.parse(message.message)
                    })
                }
                return ({
                    id: message.id,
                    role: message.sender,
                    content: message.message
                })
            }

            return ({
                id: message.id,
                role: message.sender,
                content: message.message
            })
        }) as any
    })

    const messsages = lessonsAiTasksMessages.map((message) => {
        if (message.sender === 'tool') {
            return ({
                id: message.id.toString(),
                role: message.sender,
                content: JSON.parse(message.message)
            })
        }

        if (message.sender === 'assistant') {
            // if the content is a json stringified object then parse it
            if (message.message.startsWith('{') || message.message.startsWith('[')) {
                return ({
                    id: message.id.toString(),
                    role: message.sender,
                    content: JSON.parse(message.message)
                })
            }

            return ({
                id: message.id.toString(),
                role: message.sender,
                content: message.message
            })
        }

        return ({
            id: message.id.toString(),
            role: message.sender,
            content: message.message
        })
    })

    const initialMessages = [
        { role: 'system', content: systemPrompt, id: generateId() },
        ...messsages
    ]

    return (
        <TaskAiActions
            initialUIState={uiState}
            initialAIState={{
                lessonId,
                userId,
                messages: initialMessages as Message[]
            }}
        >
            {children}
        </TaskAiActions>
    )
}
