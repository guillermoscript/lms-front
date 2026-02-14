"use client"

import { useTranslations } from "next-intl"

interface StatsCardsProps {
  hoursStudied: string
  coursesCompleted: number
  certificatesEarned: number
}

export function StatsCards({ hoursStudied, coursesCompleted, certificatesEarned }: StatsCardsProps) {
  const t = useTranslations('statsCards')

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Hours Studied */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground font-medium">{t('hoursStudied')}</p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-4xl font-bold text-foreground">{hoursStudied}h</h3>
            <span className="text-sm text-emerald-400 font-medium">+2.1%</span>
          </div>
        </div>
      </div>

      {/* Courses Completed */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground font-medium">{t('coursesCompleted')}</p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-4xl font-bold text-foreground">{coursesCompleted}</h3>
            <span className="text-sm text-muted-foreground font-medium">0%</span>
          </div>
        </div>
      </div>

      {/* Certificates Earned */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground font-medium">{t('certificatesEarned')}</p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-4xl font-bold text-foreground">{certificatesEarned}</h3>
            <span className="text-sm text-emerald-400 font-medium">+1</span>
          </div>
        </div>
      </div>
    </div>
  )
}
