
import { Message } from 'ai/react'
import dayjs from 'dayjs'
import { Check, Copy, Edit, Recycle, Trash } from 'lucide-react'

import { useScopedI18n } from '@/app/locales/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'

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
    toolInvocations?: JSX.Element
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
                        {toolInvocations && toolInvocations}
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
                                    <>
                                        <ActionButton
                                            icon={<Recycle className="h-4 w-4" />}
                                            tooltip={t('regenerate')}
                                            onClick={onRegenerate}
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
                            </div>
                        </div>
                    </div>
                    
                    <Separator className="mt-3" />
                </div>
            </div>
        </div>
    )
}

export default MessageItem

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
