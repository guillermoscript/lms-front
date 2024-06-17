import { Meh, Smile, ThumbsDown, ThumbsUp } from 'lucide-react'

import { Tables } from '@/utils/supabase/supabase'

export const formClassNames = {
    label: 'text-xs font-medium text-neutral-600',
    input: 'disabled:opacity-50',
    error: 'pt-2 text-red-400',
    container: 'mb-4 flex flex-col gap-4'
}

export const selectClassNames = {
    container: 'mb-4 flex flex-col gap-4',
    label: 'text-xs my-2 font-medium text-neutral-600',
    input: 'flex my-2 h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
    error: 'pt-2 text-red-400'
}

export const reactionTypes: Array<{
    type: Tables<'comment_reactions'>['reaction_type']
    icon: any
    color: string
}> = [
    { type: 'like', icon: ThumbsUp, color: 'text-blue-500' },
    { type: 'funny', icon: Smile, color: 'text-yellow-500' },
    { type: 'boring', icon: Meh, color: '' },
    { type: 'dislike', icon: ThumbsDown, color: 'text-red-500' }
]
