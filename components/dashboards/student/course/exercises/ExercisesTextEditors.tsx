import { Message } from 'ai/react'
import {
    Paperclip,
    Send,
} from 'lucide-react'

import { useScopedI18n } from '@/app/locales/client'
import MarkdownEditor from '@/components/dashboards/Common/chat/MarkdownEditor'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

export default function ExercisesTextEditors({
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
    append,
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
                                {t('filesSelected', { count: files.length })}
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
    )
}
