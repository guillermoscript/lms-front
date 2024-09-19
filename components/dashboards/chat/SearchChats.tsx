'use client'
import { CaretSortIcon } from '@radix-ui/react-icons'
import { useState } from 'react'

import { useScopedI18n } from '@/app/locales/client'
import ChatSidebarItem from '@/components/dashboards/chat/ChatSidebarItem'
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
    const [valueSearch, setValueSearch] = useState('')

    const allChats = Object.values(chatTypes).flat()

    const t = useScopedI18n('SearchChats')

    return (
        <div className="bg-gray-100/40 dark:bg-gray-800/40 border rounded-lg w-full p-2 max-h-[calc(100vh-4rem)] overflow-y-auto ">
            <Command className="h-auto w-full">
                <CommandInput
                    value={valueSearch}
                    onValueChange={setValueSearch}
                    placeholder={t('input')}
                />
                <CommandList>
                    <CommandEmpty>
                        {t('empty')}
                    </CommandEmpty>
                    <CommandItem className="my-2">
                        <StudentCreateNewChat />
                    </CommandItem>
                    {valueSearch ? (
                        <>
                            {allChats.map((chat: Tables<'chats'>) => {
                                return (
                                    <CommandItem
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
            {!valueSearch && (
                <div className="my-4 mx-1">
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
                                className="w-full"
                                defaultOpen={true}
                            >
                                <CollapsibleTrigger className="w-full text-md font-semibold capitalize flex items-center justify-between p-2 px-2 rounded-lg my-2 hover:bg-opacity-10 dark:hover:bg-opacity-10 hover:bg-gray-400 dark:hover:bg-gray-200">
                                    <p>{type.replace('_', ' ')}</p>
                                    <CaretSortIcon className="h-4 w-4" />
                                </CollapsibleTrigger>
                                <CollapsibleContent className="border-y border-gray-400 dark:border-gray-200">
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
                                </CollapsibleContent>
                            </Collapsible>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
