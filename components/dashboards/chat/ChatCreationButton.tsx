'use client'
import { Plus } from 'lucide-react'
import { useState } from 'react'

import { studentCreateNewChatAndRedirect } from '@/actions/dashboard/chatActions'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/use-toast'
import { Tables } from '@/utils/supabase/supabase'

export default function ChatCreationButton ({
    chatType,
    title
}: {
    chatType: Tables<'chats'>['chat_type']
    title: string
}) {
    const [isLoading, setIsLoading] = useState(false)
    const { toast } = useToast()

    if (isLoading) {
        return <Skeleton className="w-full h-8" />
    }

    return (
        <Button
            className="w-full"
            variant="secondary"
            onClick={async () => {
                setIsLoading(true)
                try {
                    const response = await studentCreateNewChatAndRedirect({
                        chatType,
                        title
                    })

                    if (response?.status === 'error') {
                        throw new Error(response.message)
                    }
                } catch (error) {
                    console.error(error)
                    toast({
                        title: 'Error',
                        description: 'Failed to create new chat',
                        variant: 'destructive'
                    })
                } finally {
                    setIsLoading(false)
                }
            }}
        >
            New Chat <Plus className="h-4 w-4" />
        </Button>
    )
}
