'use client'

import * as motion from 'motion/react-client'
import { Badge } from '@/components/ui/badge'
import { IconCircleCheck } from '@tabler/icons-react'
import { useTranslations } from 'next-intl'

export function LessonCompletionBadge() {
  const t = useTranslations('components.lessons')

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
    >
      <Badge className="bg-success/10 text-success border-success/20 text-[9px] font-bold uppercase tracking-wider h-4 px-1.5 gap-0.5">
        <IconCircleCheck className="h-2.5 w-2.5" />
        {t('completed')}
      </Badge>
    </motion.div>
  )
}
