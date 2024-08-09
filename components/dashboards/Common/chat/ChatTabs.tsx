import React from 'react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { ChatInput, ChatTextArea } from './chat'

interface ChatTabsProps {
    isLoading: boolean;
    setStop: (value: boolean) => void;
    callBack: (
        data: any,
    ) => Promise<void>;
    setIsLoading: (value: boolean) => void;
    stop: boolean;
    data: any;

}

const ChatTabs: React.FC<ChatTabsProps> = ({
    isLoading,
    setStop,
    callBack,
    stop,
    data
}) => {
    return (
        <Tabs defaultValue="simple" className="w-full py-4">
            <TabsList>
                <TabsTrigger value="simple">Simple</TabsTrigger>
                <TabsTrigger value="markdown">Markdown</TabsTrigger>
            </TabsList>
            <TabsContent value="markdown">
                <ChatInput
                    isLoading={isLoading}
                    stop={() => setStop(true)}
                    callbackFunction={async (input) => {
                        await callBack(data)
                    }}
                />
            </TabsContent>
            <TabsContent value="simple">
                <ChatTextArea
                    isLoading={isLoading}
                    stop={() => setStop(true)}
                    callbackFunction={async (input) => {
                        await callBack(data)
                    }}
                />
            </TabsContent>
        </Tabs>
    )
}

export default ChatTabs
