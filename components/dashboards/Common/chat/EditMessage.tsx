'use client'
import { useState } from 'react'

import { useScopedI18n } from '@/app/locales/client'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { ChatInput, ChatTextArea } from './chat'

export default function EditMessage({
    editMessageFun,
    text
}: {
    editMessageFun: (input: string) => void
    text: string
}) {
    const [isLoading, setIsLoading] = useState<boolean>(false)
    const [stop, setStop] = useState<boolean>(false)
    const t = useScopedI18n('EditMessage')

    return (
        <Tabs defaultValue="simple" className="w-full py-4">
            <TabsList>
                <TabsTrigger value="simple">
                    {t('simple')}
                </TabsTrigger>
                <TabsTrigger value="markdown">
                    {t('markdown')}
                </TabsTrigger>
            </TabsList>
            <TabsContent value="markdown">
                <ChatInput
                    isLoading={isLoading}
                    stop={() => setStop(true)}
                    text={text}
                    callbackFunction={async (input) => {
                        if (stop) {
                            return
                        }
                        try {
                            editMessageFun(input.content)
                        } catch (error) {
                            console.error(error)
                        } finally {
                            setIsLoading(false)
                        }
                    }}
                    buttonChildren= {
                        <div className="flex items-center justify-center gap-4">
                            <Button>
                                {t('editAndRegenerate')}
                            </Button>
                            <Button
                                variant='secondary'
                            >
                                {t('edit')}
                            </Button>
                        </div>
                    }
                />
            </TabsContent>
            <TabsContent value="simple">
                <ChatTextArea
                    isLoading={isLoading}
                    stop={() => setStop(true)}
                    text={text}
                    callbackFunction={async (input) => {
                        if (stop) {
                            return
                        }
                        try {
                            editMessageFun(input.content)
                        } catch (error) {
                            console.error(error)
                        } finally {
                            setIsLoading(false)
                        }
                    }}
                    buttonChildren= {
                        <div className="flex items-center justify-center gap-4">
                            <Button>
                                {t('editAndRegenerate')}
                            </Button>

                            <Button
                                variant='secondary'
                            >
                                {t('edit')}
                            </Button>

                        </div>
                    }
                />
            </TabsContent>
        </Tabs>
    )
}
