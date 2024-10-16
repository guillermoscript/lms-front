'use client'

import { ToolInvocation } from 'ai'
import { Message, useChat } from 'ai/react'
import dayjs from 'dayjs'
import { Check, Copy, Edit, Recycle, Trash } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useCopyToClipboard } from 'usehooks-ts'

import {
    deleteExerciseMessageAction,
    editExerciseMessageAction,
} from '@/actions/dashboard/exercisesActions'
import { useScopedI18n } from '@/app/locales/client'
import ChatLoadingSkeleton from '@/components/dashboards/chat/ChatLoadingSkeleton'
import { SuccessMessage } from '@/components/dashboards/Common/chat/chat'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'

import ExercisesTextEditors from './ExercisesTextEditors'

interface ExerciseChatProps {
    apiEndpoint: string
    exerciseId: string
    initialMessages: Message[]
    isExerciseCompleted: boolean
    profile: {
        full_name: string
        avatar_url: string
    }
}

export default function ExerciseChat({
    apiEndpoint,
    exerciseId,
    initialMessages,
    isExerciseCompleted,
    profile,
}: ExerciseChatProps) {
    const t = useScopedI18n('ExerciseChat')
    const [files, setFiles] = useState<FileList | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const chatContainerRef = useRef<HTMLDivElement>(null)
    const [isCompleted, setIsCompleted] = useState(isExerciseCompleted)

    const [editingMessageId, setEditingMessageId] = useState<string | null>(
        null
    )
    const [editedContent, setEditedContent] = useState('')
    const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
    const [copiedText, copy] = useCopyToClipboard()

    const scrollAnchorRef = useRef<HTMLDivElement>(null)
    const router = useRouter()

    const {
        messages,
        input,
        handleInputChange,
        handleSubmit,
        isLoading: isLoadingChat,
        stop,
        append,
        setMessages,
        reload,
    } = useChat({
        api: apiEndpoint ?? '/api/chat/exercises',
        initialMessages,
        body: { exerciseId },
        onFinish: (message) => {
            console.log('Message:', message)
        },
        maxSteps: 2,
        async onToolCall({ toolCall }) {
            console.log('Tool call:', toolCall)
            if (toolCall.toolName === 'makeUserAssigmentCompleted') {
                setIsCompleted(true)
                router.refresh()
            }
        },
    })

    const [isLoading, setIsLoading] = useState(isLoadingChat)

    useEffect(() => {
        setIsLoading(isLoadingChat)
    }, [isLoadingChat])

    useEffect(() => {
        if (
            messages.length > initialMessages.length &&
            scrollAnchorRef.current
        ) {
            scrollAnchorRef.current.scrollIntoView({ behavior: 'smooth' })
        }
    }, [messages, initialMessages.length])

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files) {
            setFiles(event.target.files)
        }
    }

    const removeFile = () => {
        setFiles(null)
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }

    const handleEditMessage = (messageId: string, content: string) => {
        setEditingMessageId(messageId)
        setEditedContent(content)
    }

    const handleSaveEdit = async (messageId: string) => {
        setIsLoading(true)
        try {
            const isEdited = await editExerciseMessageAction({
                exerciseId,
                messageId,
                message: messages.find((m) => m.id === messageId)?.content,
            })

            // remove all the next messasges to the one being edited
            const index = messages.findIndex((m) => m.id === messageId)
            const updatedMessages = messages.slice(0, index + 1)
            const updatedMessages2 = updatedMessages.map((m) => {
                if (m.id === messageId) {
                    return {
                        ...m,
                        content: editedContent,
                    }
                }
                return m
            })

            setMessages(updatedMessages2)

            if (isEdited.error) {
                throw new Error(isEdited.error)
            }
            reload()
            setEditingMessageId(null)
            setIsLoading(false)
        } catch (error) {
            console.log(error)
        } finally {
            setIsLoading(false)
        }
    }

    const handleDeleteMessage = async (
        messageId: string,
        messageContent: string
    ) => {
        setIsLoading(true)
        try {
            setMessages((prevMessages) =>
                prevMessages.filter((m) => m.id !== messageId)
            )
            const isDeleted = await deleteExerciseMessageAction({
                exerciseId,
                messageId,
                messageContent,
            })

            if (isDeleted.error) {
                throw new Error(isDeleted.error)
            }

            reload()
            toast.success(t('messageDeleted'))
        } catch (error) {
            console.error(error)
            toast.error(t('messageDeleteFailed'))
        } finally {
            setIsLoading(false)
        }
    }

    const regenerateAiMessage = async (
        messageId: string,
        messageContent: string
    ) => {
        setIsLoading(true)
        try {
            console.log('Regenerating AI message:', messageId, messageContent)
            await deleteExerciseMessageAction({
                exerciseId,
                messageId,
                messageContent,
            })

            reload()
            toast.success(t('aiMessageRegenerated'))
        } catch (error) {
            console.error(error)
            toast.error(t('aiMessageRegenerateFailed'))
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Card className="w-full mx-auto border-none md:border">
            <CardHeader>
                <CardTitle>{t('chatTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="p-1 md:p-6">
                <>
                    <div ref={chatContainerRef}>
                        {messages.length === 1 ? (
                            <>
                                <div className="text-center text-gray-500 mt-4 p-4 border border-dashed border-gray-300 rounded-lg">
                                    <h2 className="text-lg font-semibold mb-2 flex items-center justify-center">
                                        {t('startWritingToCompleteExercise')}
                                    </h2>
                                    <p className="text-sm mb-4">
                                        {t('feelFreeToAskQuestions')}
                                    </p>
                                </div>
                            </>
                        ) : (
                            messages.map((m: Message) => {
                                if (m.role === 'system') return null
                                return (
                                    <MessageItem
                                        key={m.id}
                                        message={m}
                                        profile={profile}
                                        isEditing={editingMessageId === m.id}
                                        editedContent={editedContent}
                                        setEditedContent={setEditedContent}
                                        onEdit={() =>
                                            handleEditMessage(m.id, m.content)
                                        }
                                        onSave={async () =>
                                            await handleSaveEdit(m.id)
                                        }
                                        onDelete={async () =>
                                            await handleDeleteMessage(
                                                m.id,
                                                m.content
                                            )
                                        }
                                        onCopy={() => {
                                            copy(m.content)
                                            setCopiedMessageId(m.id)
                                            toast.success(
                                                t('copiedToClipboard')
                                            )
                                        }}
                                        onRegenerate={async () =>
                                            await regenerateAiMessage(
                                                m.id,
                                                m.content
                                            )
                                        }
                                        isLoading={isLoading}
                                        isCompleted={isCompleted}
                                        toolInvocations={m.toolInvocations}
                                    />
                                )
                            })
                        )}
                        {isLoading && <ChatLoadingSkeleton />}
                        <div ref={scrollAnchorRef}></div>
                        {/* Scroll Anchor */}
                    </div>
                </>
                {isCompleted ? (
                    <SuccessMessage message={t('exerciseCompleted')} />
                ) : (
                    <ExercisesTextEditors
                        isLoading={isLoading}
                        stop={stop}
                        text={input}
                        input={input}
                        handleInputChange={handleInputChange}
                        handleSubmit={handleSubmit}
                        handleFileChange={handleFileChange}
                        files={files}
                        removeFile={removeFile}
                        fileInputRef={fileInputRef}
                        append={append}
                    />
                )}
            </CardContent>
        </Card>
    )
}

interface MessageItemProps {
    message: Message
    profile: {
        full_name: string
        avatar_url: string
    }
    isEditing: boolean
    editedContent: string
    setEditedContent: (content: string) => void
    onEdit: () => void
    onSave: () => void
    onDelete: () => void
    onCopy: () => void
    onRegenerate: () => void
    isLoading: boolean
    isCompleted: boolean
    toolInvocations?: ToolInvocation[]
}

const MessageItem: React.FC<MessageItemProps> = ({
    message,
    profile,
    isEditing,
    editedContent,
    setEditedContent,
    onEdit,
    onSave,
    onDelete,
    onCopy,
    onRegenerate,
    isLoading,
    isCompleted,
    toolInvocations,
}) => {
    const t = useScopedI18n('ExerciseChat')
    return (
        <div className={'mb-6'}>
            <div className="flex flex-col items-start gap-3">
                <Avatar className="w-8 h-8">
                    <AvatarImage
                        src={
                            message.role === 'user'
                                ? profile.avatar_url
                                : '/img/robot.jpeg'
                        }
                    />
                    <AvatarFallback>
                        {message.role === 'user' ? profile.full_name[0] : 'A'}
                    </AvatarFallback>
                </Avatar>
                <div className="flex-1 w-full">
                    <div className="py-3 rounded-lg ">
                        {isEditing ? (
                            <Textarea
                                value={editedContent}
                                onChange={(e) =>
                                    setEditedContent(e.target.value)
                                }
                                className="mb-2"
                                rows={8}
                            />
                        ) : (
                            <ViewMarkdown markdown={message.content} />
                        )}
                        <div className="text-xs text-gray-500 mt-1 flex items-center flex-wrap gap-4 justify-between">
                            <span>
                                {dayjs(message.createdAt).format(
                                    'MMM D, YYYY h:mm A'
                                )}
                            </span>
                            <div className="flex items-center space-x-2">
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={onCopy}
                                                disabled={isLoading}
                                            >
                                                {message.id ===
                                                'copiedMessageId' ? (
                                                        <Check className="h-4 w-4" />
                                                    ) : (
                                                        <Copy className="h-4 w-4" />
                                                    )}
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            {message.id === 'copiedMessageId'
                                                ? t('copied')
                                                : t('copyToClipboard')}
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>

                                {message.role === 'user' && (
                                    <>
                                        <ActionButton
                                            icon={
                                                isEditing ? (
                                                    <Check className="h-4 w-4" />
                                                ) : (
                                                    <Edit className="h-4 w-4" />
                                                )
                                            }
                                            tooltip={
                                                isEditing
                                                    ? t('save')
                                                    : t('edit')
                                            }
                                            onClick={
                                                isEditing ? onSave : onEdit
                                            }
                                            disabled={isLoading || isCompleted}
                                        />
                                        <ActionButton
                                            icon={<Trash className="h-4 w-4" />}
                                            tooltip={t('delete')}
                                            onClick={onDelete}
                                            disabled={isLoading || isCompleted}
                                        />
                                    </>
                                )}

                                {message.role === 'assistant' && (
                                    <ActionButton
                                        icon={<Recycle className="h-4 w-4" />}
                                        tooltip={t('regenerate')}
                                        onClick={onRegenerate}
                                        disabled={isLoading || isCompleted}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                    {toolInvocations?.map((toolInvocation) => {
                        if (
                            toolInvocation.toolName ===
                                'makeUserAssigmentCompleted' &&
                            'result' in toolInvocation
                        ) {
                            return (
                                <div
                                    key={toolInvocation.toolCallId}
                                    className="mt-3"
                                >
                                    {toolInvocation.result}
                                </div>
                            )
                        }
                        return null
                    })}
                    <Separator className="mt-3" />
                </div>
            </div>
        </div>
    )
}

interface ActionButtonProps {
    icon: React.ReactNode
    tooltip: string
    onClick: () => void
    disabled?: boolean
}

const ActionButton: React.FC<ActionButtonProps> = ({
    icon,
    tooltip,
    onClick,
    disabled = false,
}) => (
    <TooltipProvider>
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClick}
                    disabled={disabled}
                >
                    {icon}
                </Button>
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
    </TooltipProvider>
)
