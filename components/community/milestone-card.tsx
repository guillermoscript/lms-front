import type { ReactNode } from 'react'
import { IconCertificate, IconCircleCheck, IconFlame, IconSparkles, IconStairsUp } from '@tabler/icons-react'
import { useTranslations } from 'next-intl'
import { readMilestone, type Milestone } from '@/lib/community/milestones'
import type { CommunityPost } from './community-feed'

interface MilestoneCardProps {
  post: Pick<CommunityPost, 'milestone_type' | 'milestone_data'>
}

const ICONS = {
  course_completion: IconCircleCheck,
  certificate: IconCertificate,
  level_up: IconStairsUp,
  streak: IconFlame,
  unknown: IconSparkles,
} satisfies Record<Milestone['kind'], unknown>

/**
 * The body of a milestone post (#871): one quiet sentence under the author
 * row PostCard already draws — "Completed **Intro to Python**". The database
 * writes these with empty `content`; the sentence comes from `milestone_data`
 * (see `readMilestone`), with a plain fallback when a value is missing.
 */
export function MilestoneCard({ post }: MilestoneCardProps) {
  const t = useTranslations('community.milestones')
  const milestone = readMilestone(post.milestone_type, post.milestone_data)
  const Icon = ICONS[milestone.kind]
  const strong = (chunks: ReactNode) => <strong className="font-semibold text-foreground">{chunks}</strong>

  let sentence: ReactNode
  switch (milestone.kind) {
    case 'course_completion':
      sentence = milestone.course
        ? t.rich(milestone.certificate ? 'courseCompletedWithCertificate' : 'courseCompleted', {
            course: milestone.course,
            strong,
          })
        : t('courseCompletedFallback')
      break
    case 'certificate':
      sentence = milestone.course
        ? t.rich('certificateEarned', { course: milestone.course, strong })
        : t('certificateEarnedFallback')
      break
    case 'level_up':
      sentence = milestone.level ? t.rich('levelUp', { level: milestone.level, strong }) : t('fallback')
      break
    case 'streak':
      sentence = milestone.days ? t.rich('streak', { days: milestone.days, strong }) : t('fallback')
      break
    default:
      sentence = t('fallback')
  }

  return (
    <div className="flex items-center gap-3" data-testid="milestone-card" data-milestone-type={milestone.kind}>
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand-text"
      >
        <Icon size={18} />
      </span>
      <p className="min-w-0 break-words text-sm text-foreground/90">{sentence}</p>
    </div>
  )
}
