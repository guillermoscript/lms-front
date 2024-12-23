import { generateId } from 'ai'

import { Tables } from '@/utils/supabase/supabase'

import ChatLessonTask from './ChatLessonTask'

export default async function LessonTaskMessageWrapper({
    systemPrompt,
    lessonsAiTasksMessages,
    lessonId,
    isLessonAiTaskCompleted
}: {
    lessonId: string
    systemPrompt: string
    lessonsAiTasksMessages: Array<Tables<'lessons_ai_task_messages'>>
    isLessonAiTaskCompleted: boolean
}) {
    console.log(lessonsAiTasksMessages, 'lessonsAiTasksMessages')
    const formattedMessages = lessonsAiTasksMessages.map(message => {
        if (message.sender === 'tool') {
            try {
                const parsedMessage = JSON.parse(message.message || '{}')
                return {
                    id: message.id.toString(),
                    role: message.sender,
                    content: '',
                    toolInvocations: parsedMessage.toolInvocations,
                    createdAt: new Date(message.created_at)
                }
            } catch (e) {
                return null
            }
        }

        return {
            ...message,
            content: message.message || '',
            role: message.sender,
            id: message.id.toString(),
            createdAt: new Date(message.created_at)
        }
    }
    ).filter(Boolean) || []

    const initialMessages = [
        { role: 'system', content: systemPrompt, id: generateId() },
        ...formattedMessages
    ]

    console.log(initialMessages, 'initialMessages')

    return (
        <ChatLessonTask
            lessonId={Number(lessonId)}
            chatMessages={initialMessages as any}
            isLessonAiTaskCompleted={isLessonAiTaskCompleted}
        />
    )
}
