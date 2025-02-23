'use client'
import { generateId, Message as MessageType } from 'ai'
import { useRef } from 'react'

import { useScopedI18n } from '@/app/locales/client'
import { Button } from '@/components/ui/button'
import { ForwardRefEditor } from '@/components/ui/markdown/ForwardRefEditor'
import { cn } from '@/utils'

import { DisclaimerForUser } from '../../Common/chat/chat'

const MarkdowEditorInput = ({
    isLoading,
    stop,
    callbackFunction,
    isTemplatePresent,
    text,
    buttonChildren,
}: {
    isLoading: boolean
    stop?: () => void
    callbackFunction: (MessageType: MessageType) => void
    isTemplatePresent?: boolean
    text?: string
    buttonChildren?: React.ReactNode
}) => {
    const ref = useRef(null)
    const t = useScopedI18n('ChatInput')
    return (
        <>
            {isTemplatePresent && (
                <div id="message-templates" className="flex flex-wrap gap-4">
                    <Button
                        variant="outline"
                        id="form-exam-create-template"
                        disabled={isLoading}
                        className="text-wrap disabled:cursor-not-allowed"
                        onClick={() => {
                            ('Template for generating exam form')
                            const message =
                                'Please create an exam form for the topic of **"Your Topic"**\n---\nThe exam form should contain the following sections:\n- Multiple choice questions\n- True or False questions\n- Fill in the blanks\n- Matching questions\nI want it to have a minimum of "X" questions.\nIt should have a level of difficulty of "X".\nThe exam form should be interactive and engaging.\n'
                            ref.current?.setMarkdown(message)
                        }}
                    >
                        {t('templateExamForm')}
                    </Button>
                    <Button
                        variant="outline"
                        id="exam-suggestions-template"
                        disabled={isLoading}
                        className="text-wrap disabled:cursor-not-allowed"
                        onClick={() => {
                            const message =
                                'Please help me by giving suggestions of possible exams You could generate for the given topic "Your topic"'
                            ref.current?.setMarkdown(message)
                        }}
                    >
                        {t('templateForQuestion')}
                    </Button>
                </div>
            )}
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
                {
                    buttonChildren || (
                        isLoading ? (
                            <Button
                                type="button"
                                onClick={stop}
                                variant="outline"
                                className="rounded-r-lg"
                            >
                                {t('stop')}
                            </Button>
                        ) : (
                            <Button
                                type="submit"
                                className="rounded-r-lg"
                            >
                                {t('send')}
                            </Button>
                        )
                    )
                }
                <DisclaimerForUser />
            </form>
        </>
    )
}

export default MarkdowEditorInput
