'use client'

import { ToolInvocation } from 'ai'
import { Message, useChat } from 'ai/react'
import dayjs from 'dayjs'
import { Paperclip, Send } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { useScopedI18n } from '@/app/locales/client'
import { SuccessMessage } from '@/components/dashboards/Common/chat/chat'
import MarkdownEditor from '@/components/dashboards/Common/chat/MarkdownEditor'
import MarkdownEditorTour from '@/components/dashboards/Common/tour/MarkdownEditorTour'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import ChatLoadingSkeleton from '@/components/dashboards/chat/ChatLoadingSkeleton'

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
    const [files, setFiles] = useState<FileList | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const chatContainerRef = useRef<HTMLDivElement>(null)
    const [isCompleted, setIsCompleted] = useState(isExerciseCompleted)

    // Create a ref for the scroll anchor
    const scrollAnchorRef = useRef<HTMLDivElement>(null)
    const router = useRouter()

    const { messages, input, handleInputChange, handleSubmit, isLoading, stop, append } =
        useChat({
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

    useEffect(() => {
        // Skip the initial render
        if (messages.length > initialMessages.length && scrollAnchorRef.current) {
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

    return (
        <Card className="w-full mx-auto border-none md:border">
            <CardContent className="p-1 md:p-6">
                <ScrollArea className="h-[600px] pr-4">
                    <div ref={chatContainerRef}>
                        {messages.map((m: Message) => {
                            if (m.role === 'system') return null

                            return (
                                <div key={m.id} className="mb-6">
                                    <div className="flex items-start gap-3">
                                        <Avatar className="w-8 h-8">
                                            <AvatarImage
                                                src={
                                                    m.role === 'user'
                                                        ? profile.avatar_url
                                                        : '/img/robot.jpeg'
                                                }
                                            />
                                            <AvatarFallback>
                                                {m.role === 'user'
                                                    ? profile.full_name[0]
                                                    : 'A'}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1">
                                            <div className={'p-3 rounded-lg '}>
                                                <ViewMarkdown
                                                    markdown={m.content}
                                                />
                                                <div className="text-xs text-gray-500 mt-1">
                                                    {dayjs(m.createdAt).format(
                                                        'MMM D, YYYY [at] h:mm A'
                                                    )}
                                                </div>
                                            </div>
                                            {m.toolInvocations?.map(
                                                (
                                                    toolInvocation: ToolInvocation
                                                ) => {
                                                    console.log(toolInvocation)
                                                    if (
                                                        toolInvocation.toolName ===
                                                            'makeUserAssigmentCompleted' &&
                                                        'result' in
                                                            toolInvocation
                                                    ) {
                                                        return (
                                                            <div
                                                                key={
                                                                    toolInvocation.toolCallId
                                                                }
                                                                className="mt-3"
                                                            >
                                                                {
                                                                    toolInvocation.result
                                                                }
                                                            </div>
                                                        )
                                                    }
                                                    return null
                                                }
                                            )}
                                            <Separator className="mt-3" />
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                        {isLoading && <ChatLoadingSkeleton />}
                        {/* Scroll Anchor */}
                        <div ref={scrollAnchorRef}></div>
                    </div>
                </ScrollArea>
                {isCompleted ? (
                    <>
                        <SuccessMessage message="Exercise completed" />
                    </>
                ) : (
                    <TextEditors
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

function TextEditors({
    isLoading,
    stop,
    text,
    input,
    handleInputChange,
    handleSubmit,
    handleFileChange,
    files,
    removeFile,
    fileInputRef,
    append
}: {
    isLoading: boolean
    stop: () => void
    text: string
    input: string
    handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
    handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void
    handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
    files: FileList | null
    removeFile: () => void
    fileInputRef: React.RefObject<HTMLInputElement>
    append: (message: Message) => void
}) {
    const t = useScopedI18n('LessonContent.TaksMessages')

    return (
        <Tabs defaultValue="simple" className="w-full py-4">
            <div className="flex gap-4">
                <TabsList
                    id='tabs-list'
                    className='gap-4'
                >
                    <TabsTrigger
                        id='simple-tab'
                        value="simple"
                    >
                        {t('simple')}
                    </TabsTrigger>
                    <TabsTrigger
                        id='markdown-tab'
                        value="markdown"
                    >
                        {t('markdown')}
                    </TabsTrigger>
                </TabsList>
                <MarkdownEditorTour />
            </div>
            <TabsContent
                id='markdown-content'
                value="markdown"
            >
                <MarkdownEditor
                    isLoading={isLoading}
                    stop={stop}
                    callbackFunction={(e) => {
                        append(e as Message)
                        removeFile()
                    }}
                    text={text}
                />
            </TabsContent>
            <TabsContent
                id='simple-content'
                value="simple"
            >
                <form
                    className="mt-4"
                    onSubmit={(e) => {
                        e.preventDefault()
                        handleSubmit(e)
                        removeFile()
                    }}
                >
                    <div className="flex items-center gap-4 flex-col md:flex-row">
                        <Textarea
                            value={input}
                            onChange={handleInputChange}
                            placeholder="Type your message..."
                            disabled={isLoading}
                            className="flex-grow"
                        />
                        <div className="flex items-center space-x-2">
                            <Button
                                disabled={isLoading}
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <Paperclip className="h-4 w-4" />
                            </Button>
                            <Button disabled={isLoading} type="submit">
                                <Send className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                    <input
                        type="file"
                        className="hidden"
                        onChange={handleFileChange}
                        multiple
                        disabled={isLoading}
                        ref={fileInputRef}
                    />
                    {files && (
                        <div className="mt-2 flex items-center">
                            <span className="text-sm text-gray-400">
                                {files.length} file(s) selected
                            </span>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={removeFile}
                                className="ml-2 text-gray-400 hover:text-gray-200"
                            >
                                    Remove
                            </Button>
                        </div>
                    )}
                </form>
            </TabsContent>
        </Tabs>
    )
}
