import { Send } from 'lucide-react'
import { toast } from 'sonner'

import { actionButtonsAction } from '@/actions/dashboard/exercisesActions'
import { useScopedI18n } from '@/app/locales/client'
import ApprovalButton from '@/components/dashboards/Common/chat/ApprovalButton'
import useApprovalHandler from '@/components/dashboards/Common/chat/hooks/useApprovalHandler'
import MarkdownEditor from '@/components/dashboards/Common/chat/MarkdownEditor'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

export default function ExercisesTextEditors({
    isLoading: loading,
    stop,
    text,
    input,
    handleInputChange,
    handleSubmit,
    handleFileChange,
    files,
    removeFile,
    fileInputRef,
    append,
    exerciseId,
    messages,
    isCompleted,
    setIsCompleted,
    isNotApproved,
    setIsNotApproved,
    setNotApprovedMessage,
}) {
    const t = useScopedI18n('ExercisesTextEditors')

    const { isLoading, handleCheckAnswer } = useApprovalHandler({
        exerciseId,
        messages,
        setIsCompleted,
        setIsNotApproved,
        setNotApprovedMessage,
        t,
        callback: async () => {
            const res = await actionButtonsAction({
                exerciseId,
                messages,
            })

            if (res.error) {
                toast.error(t('errorLoadingExercise'))
            }
            if (res.data.isApproved === false) {
                toast.error(t('errorExerciseNotApproved'))
                setIsNotApproved(true)
                setNotApprovedMessage(res.data.toolResult)
            }

            if (res.data.isApproved) {
                setIsCompleted(true)
            }
        },
    })

    const handleMarkdownCallback = (message) => {
        append(message)
        removeFile()
    }

    return (
        <>
            {messages.length > 1 && (
                <ApprovalButton
                    isLoading={isLoading}
                    isCompleted={isCompleted}
                    onCheckAnswer={handleCheckAnswer}
                    disabled={loading}
                >
                    {t('checkAnswer')}
                </ApprovalButton>
            )}
            <Tabs defaultValue="simple" className="w-full py-4">
                <div className="flex gap-4 flex-wrap">
                    <TabsList id="tabs-list" className="gap-4">
                        <TabsTrigger id="simple-tab" value="simple">
                            {t('simple')}
                        </TabsTrigger>
                        <TabsTrigger id="markdown-tab" value="markdown">
                            {t('markdown')}
                        </TabsTrigger>
                    </TabsList>
                </div>
                <TabsContent id="markdown-content" value="markdown">
                    <MarkdownEditor
                        isLoading={isLoading}
                        stop={stop}
                        callbackFunction={handleMarkdownCallback}
                        text={text}
                    />
                </TabsContent>
                <TabsContent id="simple-content" value="simple">
                    <form
                        className="mt-4"
                        onSubmit={(e) => {
                            e.preventDefault()
                            if (input === '') return
                            handleSubmit(e)
                            removeFile()
                        }}
                    >
                        <div className="flex items-center gap-4 flex-col md:flex-row">
                            <Textarea
                                value={input}
                                onChange={handleInputChange}
                                placeholder={t('typeYourMessage')}
                                disabled={isLoading}
                                className="flex-grow"
                                rows={6}
                            />
                            <div className="flex items-center space-x-2">
                                <Button disabled={isLoading} type="submit">
                                    <Send className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        {files && (
                            <div className="mt-2 flex items-center">
                                <span className="text-sm text-gray-400">
                                    {t('filesSelected', {
                                        count: files.length,
                                    })}
                                </span>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={removeFile}
                                    className="ml-2 text-gray-400 hover:text-gray-200"
                                >
                                    {t('remove')}
                                </Button>
                            </div>
                        )}
                    </form>
                </TabsContent>
            </Tabs>
        </>
    )
}
