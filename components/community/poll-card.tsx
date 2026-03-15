'use client'

import { useState } from 'react'
import { IconChartBar } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { castVote } from '@/app/actions/community'

interface CommunityPost {
  id: string
  author_id: string
  post_type: 'standard' | 'discussion_prompt' | 'milestone' | 'poll'
  title: string | null
  content: string
  media_urls: { url: string; type: 'image' | 'video' | 'file'; name: string }[]
  is_pinned: boolean
  is_locked: boolean
  comment_count: number
  reaction_count: number
  created_at: string
  course_id: number | null
  lesson_id: number | null
  is_graded: boolean
  milestone_type: string | null
  milestone_data: any
  author: { id: string; full_name: string | null; avatar_url: string | null }
  user_reactions: string[]
  poll_options?: { id: string; option_text: string; vote_count: number; sort_order: number }[]
  user_voted_option?: string | null
}

interface PollCardProps {
  post: CommunityPost
  userId: string
}

export function PollCard({ post, userId }: PollCardProps) {
  const t = useTranslations('community')
  const [votedOption, setVotedOption] = useState<string | null>(post.user_voted_option ?? null)
  const [options, setOptions] = useState(post.poll_options ?? [])
  const [voting, setVoting] = useState(false)

  const totalVotes = options.reduce((sum, opt) => sum + opt.vote_count, 0)
  const hasVoted = votedOption !== null

  async function handleVote(optionId: string) {
    if (hasVoted || voting) return
    setVoting(true)

    // Optimistic update
    setVotedOption(optionId)
    setOptions((prev) =>
      prev.map((opt) =>
        opt.id === optionId ? { ...opt, vote_count: opt.vote_count + 1 } : opt
      )
    )

    try {
      await castVote(post.id, optionId)
    } catch {
      // Revert
      setVotedOption(null)
      setOptions((prev) =>
        prev.map((opt) =>
          opt.id === optionId ? { ...opt, vote_count: opt.vote_count - 1 } : opt
        )
      )
      toast.error(t('errorReaction'))
    } finally {
      setVoting(false)
    }
  }

  const sortedOptions = [...options].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <div className="space-y-2 mt-3">
      {sortedOptions.map((option) => {
        const percentage = totalVotes > 0 ? Math.round((option.vote_count / totalVotes) * 100) : 0
        const isSelected = votedOption === option.id

        if (hasVoted) {
          return (
            <div key={option.id} className="relative overflow-hidden rounded-lg border p-3">
              <div
                className={cn(
                  'absolute inset-0 rounded-lg transition-all',
                  isSelected ? 'bg-primary/15' : 'bg-muted/30'
                )}
                style={{ width: `${percentage}%` }}
              />
              <div className="relative flex items-center justify-between">
                <span className={cn('text-xs font-medium', isSelected && 'text-primary')}>
                  {option.option_text}
                </span>
                <span className="text-xs text-muted-foreground font-medium">{percentage}%</span>
              </div>
            </div>
          )
        }

        return (
          <Button
            key={option.id}
            variant="outline"
            className="w-full justify-start h-auto py-2.5 px-3 text-xs font-medium"
            onClick={() => handleVote(option.id)}
            disabled={voting}
          >
            {option.option_text}
          </Button>
        )
      })}
      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 pt-1">
        <IconChartBar size={12} />
        {t('poll.totalVotes', { count: totalVotes })}
      </p>
    </div>
  )
}
