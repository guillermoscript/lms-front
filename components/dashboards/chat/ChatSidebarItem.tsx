'use client'
import { UpdateIcon } from '@radix-ui/react-icons'
import dayjs from 'dayjs'
import { Check, CircleSlashedIcon, MoreHorizontalIcon, Trash } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'

import { deleteChat, studentUpdateChatTitle } from '@/actions/dashboard/chatActions'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger
} from '@/components/ui/tooltip'
import { cn } from '@/utils'

export default function ChatSidebarItem ({
    chat,
    chatType,
    userRole
}: {
    chat: {
        chat_id: number
        title: string
        created_at: string
    }
    chatType: string
    userRole: string
}) {
    const [isLoading, setIsLoading] = useState(false)
    const [isUpdate, setIsUpdate] = useState(false)
    const path = usePathname()
    const router = useRouter()

    const chatId = Number(chat.chat_id)
    if (isLoading) {
        return (
            <div className="w-full p-2 rounded-lg overflow-hidden text-ellipsis">
                <Skeleton className="w-full h-8" />
            </div>
        )
    }

    if (isUpdate) {
        return (
            <form
                onSubmit={async (e: React.FormEvent<HTMLFormElement>) => {
                    e.preventDefault()
                    setIsLoading(true)
                    try {
                        // @ts-expect-error
                        const title = e.target?.title.value
                        const chat = await studentUpdateChatTitle({ chatId, title })
                    } catch (error) {
                        console.error(error)
                    } finally {
                        setIsLoading(false)
                        setIsUpdate(false)
                    }
                }}
                className="w-full flex flex-col gap-2 p-2 rounded-lg overflow-hidden text-ellipsis"
            >
                <input
                    type="text"
                    className="w-full h-8"
                    name='title'
                    defaultValue={chat.title}
                    autoFocus
                />
                <Button
                    type="submit"
                    variant='outline'
                    className="w-full"
                >
                    <Check className="h-5 w-5" />
                </Button>
                <Button
                    type='button'
                    variant='destructive'
                    onClick={() => setIsUpdate(false)}
                    className="w-full"
                >
                    <CircleSlashedIcon className="h-5 w-5" />
                </Button>
            </form>
        )
    }

    return (
        <li
            className="w-full p-2 rounded-lg overflow-hidden text-ellipsis"
            key={chat.chat_id}
        >
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Link
                            className={cn(
                                'text-md font-semibold text-gray-900 dark:text-gray-50 capitalize hover:underline',
                                path === `/dashboard/${userRole}/chat/${chat.chat_id}/${chatType}`
                                    ? 'dark:text-primary text-primary'
                                    : ''
                            )}
                            href={`/dashboard/${userRole}/chat/${chat.chat_id}/${chatType}`}
                        >
                            {chat.title.slice(0, 30)}
                        </Link>
                    </TooltipTrigger>
                    <TooltipContent className='max-w-[600px] p-2 rounded-lg '>
                        {chat.title}
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
            <div className="flex gap-3 justify-between">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    {dayjs(chat.created_at).format('MMM D, YYYY')}
                </p>
                <Popover>
                    <PopoverTrigger>
                        <MoreHorizontalIcon className="h-5 w-5" />
                    </PopoverTrigger>
                    <PopoverContent className="flex flex-col gap-4 p-3 w-fit">
                        <AlertDialog>
                            <AlertDialogTrigger className="flex gap-2 items-center">
                                <Trash className="h-5 w-5" />

                                <p>Delete</p>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>
                      Are you absolutely sure?
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete
                      your chat.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={async () => {
                                            setIsLoading(true)
                                            try {
                                                const chat = await deleteChat({ chatId })
                                                if (`/dashboard/${userRole}/chat/${chatId}/${chatType}` === path) {
                                                    router.push(`/dashboard/${userRole}/chat`)
                                                }
                                            } catch (error) {
                                                console.error(error)
                                            } finally {
                                                setIsLoading(false)
                                            }
                                        }}
                                    >
                      Continue
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                        <button
                            onClick={() => setIsUpdate(true)}
                            className="flex gap-2 items-center"
                        >
                            <UpdateIcon className="h-5 w-5" />
                            <p>Update</p>
                        </button>
                    </PopoverContent>
                </Popover>
            </div>
        </li>
    )
}
