'use client'
import { CaretSortIcon } from '@radix-ui/react-icons'
import { useState } from 'react'

import ChatSidebarItem from '@/components/dashboards/student/chat/ChatSidebarItem'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
    Command,
    CommandEmpty,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command'
import { Tables } from '@/utils/supabase/supabase'

import ChatCreationButton from './ChatCreationButton'
import StudentCreateNewChat from './StudentCreateNewChat'
export default function SearchChats({
    chatTypes,
    userRole,
}: {
    chatTypes: Record<string, Array<Tables<'chats'>>>
    userRole: Tables<'user_roles'>['role']
}) {
    const [showChats, setShowChats] = useState(false)

    const allChats = Object.values(chatTypes).flat()

    return (
        <div className="bg-gray-100/40 dark:bg-gray-800/40 border rounded-lg w-full p-2 max-h-[calc(100vh-4rem)] overflow-y-auto ">
            <Command className="h-auto w-full">
                <CommandInput
                    onValueChange={(value) => {
                        if (value === '') {
                            setShowChats(false)
                        } else {
                            setShowChats(true)
                        }
                    }}
                    placeholder="Type to search your chats"
                />
                <CommandList>
                    <CommandEmpty>No results found.</CommandEmpty>
                    <CommandItem
                        className='my-2'
                    >
                        <StudentCreateNewChat />
                    </CommandItem>
                    {showChats ? (
                        <>
                            {allChats.map((chat: Tables<'chats'>) => {
                                return (
                                    <CommandItem
                                        value={chat.chat_id + chat.chat_type + chat.title}
                                        key={chat.chat_id}
                                    >
                                        <ChatSidebarItem
                                            chat={chat}
                                            chatType={chat.chat_type}
                                            userRole={userRole}
                                        />
                                    </CommandItem>
                                )
                            })}
                        </>
                    ) : null}
                </CommandList>
            </Command>
            {!showChats && (
                <>
                    {Object.entries(chatTypes).map(([type, chats], index) => {
                        const types = {
                            free_chat: 'free-chat',
                            qna: 'qa',
                            exam_prep: 'exam-prep',
                            course_chat: 'study-material',
                        }

                        const title = {
                            free_chat: 'Free Chat',
                            qna: 'Q&A',
                            exam_prep: 'Exam Prep',
                            course_chat: 'Study Material',
                        }

                        return (
                            <Collapsible
                                id={type}
                                key={index + type}
                                defaultOpen={true}
                                className="w-full"
                            >
                                <CollapsibleTrigger className="w-full text-md font-semibold capitalize flex items-center justify-between p-2 px-2 rounded-lg my-2 hover:bg-opacity-10 dark:hover:bg-opacity-10 hover:bg-gray-400 dark:hover:bg-gray-200">
                                    <p>{type.replace('_', ' ')}</p>
                                    <CaretSortIcon className="h-4 w-4" />
                                </CollapsibleTrigger>
                                <CollapsibleContent className="border-y border-gray-400 dark:border-gray-200">
                                    <>
                                        <div className="my-4 mx-1">
                                            <ChatCreationButton
                                                chatType={
                                                    type as
                                                        | 'free_chat'
                                                        | 'exam_prep'
                                                }
                                                title={`Untitled ${title[type]}`}
                                            />
                                        </div>
                                        {chats.map((chat: Tables<'chats'>) => {
                                            return (
                                                <>
                                                    <ChatSidebarItem
                                                        key={chat.chat_id}
                                                        chat={chat}
                                                        chatType={types[type]}
                                                        userRole={userRole}
                                                    />
                                                </>
                                            )
                                        })}
                                    </>
                                </CollapsibleContent>
                            </Collapsible>
                        )
                    })}
                </>
            )}
        </div>
    )
}
