// Force the page to be dynamic and allow streaming responses up to 30 seconds

import FreeChat from '@/components/dashboards/student/chat/FreeChat'
import { Badge } from '@/components/ui/badge'
import {
    HoverCard,
    HoverCardContent,
    HoverCardTrigger
} from '@/components/ui/hover-card'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export default async function ChatPage () {
    return (
        <>
            <div className="flex flex-col gap-4 w-full mb-8">
                <h1 className="text-2xl font-semibold text-gray-800">
                Select a chat or start a new one
                </h1>
                <div className="flex flex-wrap gap-4 w-full">
                    <HoverCard>
                        <HoverCardTrigger asChild>
                            <Badge variant="outline">Free Chat</Badge>
                        </HoverCardTrigger>
                        <HoverCardContent>Chat with the AI about anything</HoverCardContent>
                    </HoverCard>
                    <HoverCard>
                        <HoverCardTrigger asChild>
                            <Badge variant="outline">Q&A</Badge>
                        </HoverCardTrigger>
                        <HoverCardContent>Ask the AI any question</HoverCardContent>
                    </HoverCard>
                    <HoverCard>
                        <HoverCardTrigger asChild>
                            <Badge variant="outline">Exam Preparation</Badge>
                        </HoverCardTrigger>
                        <HoverCardContent>Prepare for your exams</HoverCardContent>
                    </HoverCard>
                    <HoverCard>
                        <HoverCardTrigger asChild>
                            <Badge variant="outline">Course Chat</Badge>
                        </HoverCardTrigger>
                        <HoverCardContent>
              Chat with the AI about your course
                        </HoverCardContent>
                    </HoverCard>
                </div>
            </div>
            <FreeChat>

            </FreeChat>
        </>
    )
}
