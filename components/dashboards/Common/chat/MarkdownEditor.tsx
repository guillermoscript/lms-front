import { generateId } from 'ai'
import { useRef } from 'react'

import { useScopedI18n } from '@/app/locales/client'
import { Button } from '@/components/ui/button'
import { ForwardRefEditor } from '@/components/ui/markdown/ForwardRefEditor'
import { cn } from '@/utils'

import { DisclaimerForUser } from './chat'

export default function MarkdownEditor({
    isLoading,
    stop,
    callbackFunction,
    text,
    buttonChildren,
}: {
    isLoading: boolean
    stop?: () => void
    callbackFunction: ({
        content,
        role,
        createdAt,
        id,
    }: {
        content: string
        role: string
        createdAt: Date
        id: string
    }) => void
    isTemplatePresent?: boolean
    text?: string
    buttonChildren?: React.ReactNode
}) {
    const ref = useRef(null)
    const t = useScopedI18n('ChatInput')
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault()
                callbackFunction({
                    content: ref.current?.getMarkdown() || '',
                    role: 'user',
                    createdAt: new Date(),
                    id: generateId(),
                })
                ref.current?.setMarkdown('')
            }}
            className="py-4 flex gap-2 flex-col w-full"
        >
            <ForwardRefEditor
                className={cn(
                    'flex-1 p-2 rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full rich-text markdown-body',
                    isLoading ? 'cursor-not-allowed' : 'cursor-text',
                    'editor'
                )}
                placeholder={t('placeholder')}
                markdown={text ?? ''}
                ref={ref}
            />
            <input type="hidden" value={ref.current?.getMarkdown()} />
            {buttonChildren ||
                (isLoading ? (
                    <Button
                        type="button"
                        onClick={stop}
                        variant="outline"
                        className="rounded-r-lg"
                    >
                        {t('stop')}
                    </Button>
                ) : (
                    <Button type="submit" className="rounded-r-lg">
                        {t('send')}
                    </Button>
                ))}
            <DisclaimerForUser />
        </form>
    )
}
