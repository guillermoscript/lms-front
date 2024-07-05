import { AI, getUIStateFromAIState } from '@/actions/dashboard/ExamPreparationActions'
import { createClient } from '@/utils/supabase/server'

export default async function ExamnChatIdPageLayout ({
    params,
    children
}: {
    params: {
        chatId: string
    }
    children: React.ReactNode
}) {
    const supabase = createClient()

    const messagesData = await supabase
        .from('chats')
        .select('*, messages(*)')
        .eq('chat_id', Number(params.chatId))
        .order('created_at', { foreignTable: 'messages', ascending: true })
        .single()

    if (messagesData.error) {
        console.log(messagesData.error)
        throw new Error('Error fetching messages')
    }

    // WTF!!!! why this need an await?????
    const uiState = await getUIStateFromAIState({
        id: messagesData.data.chat_id,
        createdAt: messagesData.data.created_at,
        messages: messagesData.data.messages.map((message) => {
            if (!message) return null

            if (message.sender === 'tool') {
                return ({
                    id: message.id,
                    role: message.sender as any,
                    content: JSON.parse(message.message)
                })
            }

            if (message.sender === 'assistant') {
                // if the content is a json stringified object then parse it
                if (message.message.startsWith('{') || message.message.startsWith('[')) {
                    return ({
                        id: message.id,
                        role: message.sender as any,
                        content: JSON.parse(message.message)
                    })
                }
                return ({
                    id: message.id,
                    role: message.sender as any,
                    content: message.message
                })
            }

            return ({
                id: message.id,
                role: message.sender as any,
                content: message.message
            })
        })
    })

    const messsages = messagesData.data.messages.map((message) => {
        if (message.sender === 'tool') {
            return ({
                id: message.id,
                role: message.sender as any,
                content: JSON.parse(message.message)
            })
        }

        if (message.sender === 'assistant') {
            // if the content is a json stringified object then parse it
            if (message.message.startsWith('{') || message.message.startsWith('[')) {
                return ({
                    id: message.id,
                    role: message.sender as any,
                    content: JSON.parse(message.message)
                })
            }

            return ({
                id: message.id,
                role: message.sender as any,
                content: message.message
            })
        }

        return ({
            id: message.id,
            role: message.sender as any,
            content: message.message
        })
    })

    console.log(messagesData)

    console.log(uiState)

    console.log(messsages)
    return (
        <AI
            initialUIState={uiState}
            initialAIState={{ chatId: (params.chatId), messages: messsages }}
        >
            {children}
        </AI>
    )
}

// export interface Chat extends Record<string, any> {
//     id: string
//     createdAt: Date
//     messages: Message[]
// }

// const isUserMessage = (message) => message.role === 'user' && typeof message.content === 'string'
// const isAssistantMessage = (message) => message.role === 'assistant' && typeof message.content === 'string'
// const isToolMessage = (message) => message.role === 'tool'

// const renderToolContent = (tool) => {
//     switch (tool.toolName) {
//         case 'showExamnForm':
//             return (
//                 <ExamPrepAiComponent
//                     singleSelectQuestions={tool.result.singleSelectQuestion}
//                     multipleChoiceQuestions={tool.result.multipleChoiceQuestion}
//                     freeTextQuestions={tool.result.freeTextQuestion}
//                 />
//             )
//         case 'showExamnResult':
//             return (
//                 <ExamFeedbackCard
//                     score={tool.result.score}
//                     overallFeedback={tool.result.overallFeedback}
//                     questionAndAnswerFeedback={tool.result.questionAndAnswerFeedback}
//                 />
//             )
//         default:
//             return null
//     }
// }

// const renderMessageContent = (message) => {
//     if (isUserMessage(message)) {
//         return <ViewMarkdown markdown={message.content} />
//     }
//     if (isAssistantMessage(message)) {
//         return <ViewMarkdown markdown={message.content} />
//     }
//     if (isToolMessage(message)) {
//         return message.content.map(renderToolContent)
//     }
//     return null
// }

// const renderMessage = (message, chatId, index) => (
//     <Message
//         key={`${chatId}-${index}`}
//         sender={message.role === 'tool' ? 'assistant' : message.role}
//         time={new Date().toDateString()}
//         isUser={message.role === 'user'}
//     >
//         {renderMessageContent(message)}
//     </Message>
// )

// export const getUIStateFromAIState = (aiState: Chat) => {
//     return aiState.messages
//         .filter(message => message.role !== 'system')
//         .map((message, index) => {
//             return renderMessage(message, aiState.id, index)
//         })
// }
