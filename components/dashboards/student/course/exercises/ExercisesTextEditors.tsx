import { Message } from 'ai/react'
import { Check, Loader, Send } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { actionButtonsAction } from '@/actions/dashboard/exercisesActions'
import { useScopedI18n } from '@/app/locales/client'
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
    messages: Message[]
    exerciseId: string
    isCompleted: boolean
    setIsCompleted: (isCompleted: boolean) => void
    isNotApproved: boolean
    setIsNotApproved: (isNotApproved: boolean) => void
    setNotApprovedMessage: (notApprovedMessage: string) => void
}) {
    const t = useScopedI18n('ExercisesTextEditors')
    const [isLoading, setIsLoading] = useState(loading)

    useEffect(() => {
        // after 5 seconds of the isNotApproved state being true, it will be set to false
        const timeout = setTimeout(() => {
            setIsNotApproved(false)
        }, 15000)

        return () => clearTimeout(timeout)
    }, [isNotApproved])

    return (
        <>
            {messages.length > 1 && (
                <Button
                    onClick={async () => {
                        setIsLoading(true)
                        try {
                            const res = await actionButtonsAction({
                                exerciseId,
                                messages,
                            })

                            console.log(res)

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
                        } catch (error) {
                            console.error(error)
                            toast.error(t('errorLoadingExercise'))
                            setIsNotApproved(true)
                        } finally {
                            setIsLoading(false)
                        }
                    }}
                    disabled={isLoading || isCompleted}
                    className="mt-4"
                >
                    {isLoading ? (
                        <Loader className="animate-spin" />
                    ) : (
                        <>
                            {t('checkAnswer')}
                            <Check className="h-4 w-4 ml-2" />
                        </>
                    )}
                </Button>
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
                        callbackFunction={(e) => {
                            append(e as Message)
                            removeFile()
                        }}
                        text={text}
                    />
                </TabsContent>
                <TabsContent id="simple-content" value="simple">
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
                                placeholder={t('typeYourMessage')}
                                disabled={isLoading}
                                className="flex-grow"
                                rows={6}
                            />
                            <div className="flex items-center space-x-2">
                                {/* <Button
                                disabled={isLoading}
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <Paperclip className="h-4 w-4" />
                            </Button> */}
                                <Button disabled={isLoading} type="submit">
                                    <Send className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                        {/* <input
                        type="file"
                        className="hidden"
                        onChange={handleFileChange}
                        multiple
                        disabled={isLoading}
                        ref={fileInputRef}
                    /> */}
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
