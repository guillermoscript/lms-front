import { IconCheck } from '@tabler/icons-react'

interface LessonCompletionCardProps {
    title: string
    feedback?: string
    /** Extra line under the feedback — the editor preview says nothing was saved. */
    note?: string
}

/** What a student sees in the conversation the moment the tutor completes the lesson. */
export function LessonCompletionCard({ title, feedback, note }: LessonCompletionCardProps) {
    return (
        <div className="mt-3 sm:mt-4 p-3 sm:p-5 bg-success/10 border border-success/20 rounded-xl sm:rounded-2xl text-success text-sm shadow-sm ring-1 ring-inset ring-success/10">
            <div className="flex items-start gap-3 sm:gap-4">
                <div className="p-2 bg-success rounded-lg shadow-lg">
                    <IconCheck aria-hidden="true" className="h-5 w-5 text-success-foreground" />
                </div>
                <div className="space-y-1">
                    <p className="font-bold text-base text-success">{title}</p>
                    {feedback && <p className="opacity-90 leading-relaxed text-sm">{feedback}</p>}
                    {note && <p className="text-xs text-muted-foreground">{note}</p>}
                </div>
            </div>
        </div>
    )
}
