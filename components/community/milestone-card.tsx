import { IconTrophy, IconFlame, IconMoodSmile } from '@tabler/icons-react'
import { useTranslations } from 'next-intl'

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

interface MilestoneCardProps {
  post: CommunityPost
}

const milestoneIcons: Record<string, React.ReactNode> = {
  course_completion: <IconTrophy size={24} className="text-yellow-500" />,
  certificate: <IconTrophy size={24} className="text-blue-500" />,
  level_up: <IconFlame size={24} className="text-orange-500" />,
  streak: <IconFlame size={24} className="text-red-500" />,
}

const milestoneGradients: Record<string, string> = {
  course_completion: 'from-yellow-500/10 to-amber-500/5',
  certificate: 'from-blue-500/10 to-indigo-500/5',
  level_up: 'from-orange-500/10 to-red-500/5',
  streak: 'from-red-500/10 to-pink-500/5',
}

const milestoneTypeKeyMap: Record<string, string> = {
  course_completion: 'courseCompleted',
  certificate: 'certificateEarned',
  level_up: 'levelUp',
  streak: 'streak',
}

export function MilestoneCard({ post }: MilestoneCardProps) {
  const t = useTranslations('community')
  const milestoneType = post.milestone_type || 'course_completion'
  const icon = milestoneIcons[milestoneType] || <IconMoodSmile size={24} className="text-primary" />
  const gradient = milestoneGradients[milestoneType] || 'from-primary/10 to-primary/5'
  const milestoneKey = milestoneTypeKeyMap[milestoneType] || 'courseCompleted'

  return (
    <div className={`rounded-xl border p-4 bg-gradient-to-r ${gradient}`}>
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-background/80 shadow-sm">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {t(`milestone.${milestoneKey}`, { name: post.author.full_name || t('unknownUser'), course: '', level: '', days: '' })}
          </p>
          <p className="font-semibold text-sm mt-0.5">
            {post.author.full_name || t('unknownUser')}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">
            {post.content}
          </p>
        </div>
      </div>
    </div>
  )
}
