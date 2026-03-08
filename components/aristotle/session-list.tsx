'use client'

import { useState, useEffect } from 'react'
import { IconHistory } from '@tabler/icons-react'
import { Badge } from '@/components/ui/badge'
import { useTranslations } from 'next-intl'

interface Session {
    session_id: string
    summary: string
    topics_discussed: string[]
    started_at: string
    ended_at: string | null
}

interface SessionListProps {
    courseId: number
}

export function SessionList({ courseId }: SessionListProps) {
    const [sessions, setSessions] = useState<Session[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const t = useTranslations('aristotle')

    useEffect(() => {
        async function fetchSessions() {
            try {
                const res = await fetch(`/api/aristotle/sessions?courseId=${courseId}`)
                if (res.ok) {
                    const data = await res.json()
                    setSessions(data.sessions)
                }
            } catch {
                // silently fail
            } finally {
                setIsLoading(false)
            }
        }
        fetchSessions()
    }, [courseId])

    if (isLoading) {
        return (
            <div className="space-y-2 p-3">
                {[1, 2, 3].map(i => (
                    <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
                ))}
            </div>
        )
    }

    if (sessions.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
                <IconHistory className="h-5 w-5 mb-2 opacity-30" />
                <p className="text-xs">{t('noSessions')}</p>
            </div>
        )
    }

    return (
        <div className="space-y-1 p-2">
            {sessions.map((session) => (
                <div
                    key={session.session_id}
                    className="rounded-lg p-2.5 text-left hover:bg-muted/50 transition-colors"
                >
                    <p className="text-[11px] text-muted-foreground mb-0.5">
                        {new Date(session.started_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                        })}
                    </p>
                    <p className="text-xs line-clamp-2 leading-snug">
                        {session.summary}
                    </p>
                    {session.topics_discussed.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                            {session.topics_discussed.slice(0, 3).map((topic) => (
                                <Badge key={topic} variant="outline" className="text-[9px] px-1 py-0 font-normal">
                                    {topic}
                                </Badge>
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
    )
}
