import { Message } from 'ai'
import dayjs from 'dayjs'
import { Copy, Edit, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useCopyToClipboard } from 'usehooks-ts'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import { cn } from '@/utils'

interface MessageItemProps {
    message: Message
    reload: (message: Message) => void
    isLoading: boolean
    disabled: boolean
}

export function MessageItem({ message, reload, isLoading, disabled }: MessageItemProps) {
    const isAssistant = message.role === 'assistant'
    const [copiedText, copy] = useCopyToClipboard()

    const renderToolInvocation = (toolInvocation: any, index: number) => {
        if (!toolInvocation.result) {
            return null
        }
        switch (toolInvocation?.toolName) {
            case 'makeUserAssignmentCompleted':
                if (!toolInvocation.result) return null
                return (
                    <div key={`${message.id}-tool-${index}`} className="mt-3 w-full">
                        {toolInvocation.result && (
                            <ViewMarkdown markdown={message.content} />
                        )}
                    </div>
                )
            default:
                return (
                    <div key={`${message.id}-${index}`} className="mt-3">
                        <Card className="p-4 bg-accent">
                            <p className="font-semibold">{toolInvocation.toolName}</p>
                            <p className="text-sm text-muted-foreground">
                                {JSON.stringify(toolInvocation.args)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                                {JSON.stringify(toolInvocation.result)}
                            </p>
                        </Card>
                    </div>
                )
        }
    }

    return (
        <div className="group relative mb-4 flex flex-col items-start gap-4 px-4">
            <Avatar className="h-8 w-8 shrink-0">
                {isAssistant ? (
                    <>
                        <AvatarImage src="/placeholder.svg" alt="AI Assistant" />
                        <AvatarFallback>AI</AvatarFallback>
                    </>
                ) : (
                    <>
                        <AvatarImage src="/placeholder.svg" alt="User" />
                        <AvatarFallback>U</AvatarFallback>
                    </>
                )}
            </Avatar>
            <div className="flex-1 space-y-2 w-full">
                <div className="flex items-center gap-2 w-full">
                    <span className="font-semibold">
                        {isAssistant ? 'Assistant' : 'You'}
                    </span>
                    {message.createdAt && (
                        <span className="text-sm text-muted-foreground">
                            {dayjs(message.createdAt).format('MMM D, YYYY h:mm A')}
                        </span>
                    )}
                </div>
                <Card className={cn(
                    'p-4 text-sm leading-relaxed',
                    isAssistant ? 'bg-accent' : 'bg-background'
                )}
                >
                    {(message.role === 'assistant' || message.role === 'user') && (
                        <ViewMarkdown markdown={message.content} />
                    )}
                    {message.experimental_attachments?.map((attachment, index) => (
                        attachment.contentType?.startsWith('image/') && (
                            <div key={`${message.id}-${index}`} className="mt-3">
                                <img
                                    src={attachment.url}
                                    alt={attachment.name ?? `Attachment ${index + 1}`}
                                    className="rounded-lg max-w-full h-auto"
                                />
                            </div>
                        )
                    ))}
                    {message?.toolInvocations?.map((tool, index) =>
                        renderToolInvocation(tool, index)
                    )}
                    {message.role === 'data' && !message.toolInvocations && (() => {
                        try {
                            const toolData = JSON.parse(message.content)
                            if (Array.isArray(toolData)) {
                                return toolData.map((tool, index) =>
                                    renderToolInvocation(tool, index)
                                )
                            } else {
                                return renderToolInvocation(toolData, 0)
                            }
                        } catch (e) {
                            console.error('Failed to parse message content as JSON:', e)
                            return null
                        }
                    })()}
                </Card>
                {message?.role === 'assistant' || message.role === 'user' ? (
                    <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <>
                            <Button
                                disabled={isLoading || disabled}
                                onClick={() => {
                                    toast.success('Message copied to clipboard')
                                    copy(message.content)
                                }}
                                variant="ghost" size="icon" className="h-8 w-8"
                            >
                                <Copy className="h-4 w-4" />
                                <span className="sr-only">Copy message</span>
                            </Button>
                            {
                                message.role === 'user' && (
                                    <Button
                                        disabled={isLoading || disabled} variant="ghost" size="icon" className="h-8 w-8"
                                    >
                                        <Edit className="h-4 w-4" />
                                        <span className="sr-only">Edit prompt</span>
                                    </Button>
                                )
                            }
                            {
                                message.role === 'assistant' && (
                                    <Button
                                        disabled={isLoading || disabled}
                                        onClick={() => {
                                            reload(message)
                                        }}
                                        variant="ghost" size="icon" className="h-8 w-8"
                                    >
                                        <RefreshCw className="h-4 w-4" />
                                        <span className="sr-only">Regenerate response</span>
                                    </Button>
                                )
                            }
                        </>
                    </div>
                ) : null}
            </div>
        </div>
    )
}
