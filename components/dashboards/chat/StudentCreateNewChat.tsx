'use client'
import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { studentCreateNewChat } from '@/actions/dashboard/chatActions'
import { useScopedI18n } from '@/app/locales/client'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

export default function StudentCreateNewChat () {
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)
    const t = useScopedI18n('StudentCreateNewChat')

    return isLoading ? (
        <Skeleton className="w-full h-8" />
    ) : (
        <Button
            className='w-full'
            onClick={async () => {
                setIsLoading(true)
                try {
                    const chat = await studentCreateNewChat({
                        chatType: 'free_chat',
                        title: t('newChatTitle')
                    })

                    if (chat.status === 'error') {
                        throw new Error(chat.message)
                    }

                    router.push(
                        '/dashboard/student/chat/' + chat.data.chat_id + '/free-chat'
                    )
                } catch (error) {
                    console.log(error)
                } finally {
                    setIsLoading(false)
                }
            }}
        >
            {t('newChat')} <Plus className="h-4 w-4" />
        </Button>
    )
}
