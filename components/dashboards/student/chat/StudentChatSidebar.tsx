import { CaretSortIcon } from '@radix-ui/react-icons'

import ChatSidebarItem from '@/components/dashboards/student/chat/ChatSidebarItem'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger
} from '@/components/ui/collapsible'
import {
    Command,
    CommandEmpty,
    CommandInput,
    CommandItem,
    CommandList
} from '@/components/ui/command'
import { createClient } from '@/utils/supabase/server'
import { Tables } from '@/utils/supabase/supabase'

export default async function StudentChatSidebar ({ userRole }) {
    const supabase = createClient()
    const user = await supabase.auth.getUser()

    const chats = await supabase
        .from('chats')
        .select('*')
        .eq('user_id', user.data.user.id)
        .order('created_at', { ascending: false })

    if (chats.error) {
        console.log(chats.error)
        throw new Error('Error fetching chats')
    }

    const chatTypes = {
        free_chat: chats.data.filter((chat) => chat.chat_type === 'free_chat'),
        exam_prep: chats.data.filter((chat) => chat.chat_type === 'exam_prep')
    }

    return (
        <nav className="flex flex-col gap-2 h-auto justify-start w-full border-none items-start ">
            <Command
                className='bg-gray-100/40 dark:bg-gray-800/40 border rounded-lg w-full'
            >
                <CommandInput placeholder="Type to search..." />
                <CommandList className="w-full px-2 max-h-[calc(100vh-4rem)] overflow-y-auto">
                    <CommandEmpty>No results found.</CommandEmpty>

                    {Object.entries(chatTypes).map(([type, chats]) => {
                        return (
                            <Collapsible
                                defaultOpen={true}
                                className="w-full"
                            >
                                <CollapsibleTrigger
                                    className="w-full text-md font-semibold capitalize flex items-center justify-between p-2 px-2 rounded-lg my-2 hover:bg-opacity-10 dark:hover:bg-opacity-10 hover:bg-gray-400 dark:hover:bg-gray-200"
                                >
                                    <p>
                                        {type.replace('_', ' ')}
                                    </p>
                                    <CaretSortIcon className="h-4 w-4" />
                                </CollapsibleTrigger>
                                <CollapsibleContent
                                    className='border-y border-gray-400 dark:border-gray-200'
                                >
                                    {chats.map((chat: Tables<'chats'>) => {
                                        const types = {
                                            free_chat: 'free-chat',
                                            qna: 'qa',
                                            exam_prep: 'exam-prep',
                                            course_chat: 'study-material'
                                        }

                                        return (
                                            <CommandItem value={chat.chat_id.toString()}>
                                                <ChatSidebarItem
                                                    key={chat.chat_id}
                                                    chat={chat}
                                                    chatType={types[type]}
                                                    userRole={userRole}
                                                />
                                            </CommandItem>
                                        )
                                    })}
                                </CollapsibleContent>
                            </Collapsible>
                        )
                    })}
                </CommandList>
            </Command>
        </nav>
    )
}
