'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { IconCheck, IconStar, IconBook, IconUser, IconBell } from '@tabler/icons-react'
import { useTranslations } from 'next-intl'

/**
 * Live preview of the current theme applied to common UI components.
 * Renders entirely with CSS custom properties so it reacts to theme changes.
 */
export function ThemePreview() {
  const t = useTranslations('dashboard.admin.appearance.preview')

  const notifications = [
    { icon: IconCheck, text: t('assignmentGraded'), time: t('timeAgo2m'), accent: true },
    { icon: IconStar, text: t('achievementUnlocked'), time: t('timeAgo1h'), accent: false },
    { icon: IconUser, text: t('newStudentEnrolled'), time: t('timeAgo3h'), accent: false },
  ]

  const stats = [
    { label: t('students'), value: '142', change: '+12%' },
    { label: t('courses'), value: '8', change: '+2' },
    { label: t('revenue'), value: '$2.4k', change: '+18%' },
    { label: t('completion'), value: '73%', change: '+5%' },
  ]

  return (
    <div className="space-y-4">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {t('title')}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Card preview */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <IconBook className="h-[18px] w-[18px] text-primary" strokeWidth={1.75} />
              <CardTitle className="text-base">{t('courseTitle')}</CardTitle>
            </div>
            <CardDescription>{t('courseDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge>{t('published')}</Badge>
              <Badge variant="secondary">{t('lessons')}</Badge>
            </div>
            <Progress value={65} className="h-2" />
            <p className="text-xs text-muted-foreground">{t('complete', { value: 65 })}</p>
          </CardContent>
        </Card>

        {/* Buttons & inputs preview */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('components')}</CardTitle>
            <CardDescription>{t('componentsDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button size="sm">{t('primary')}</Button>
              <Button size="sm" variant="secondary">{t('secondary')}</Button>
              <Button size="sm" variant="outline">{t('outline')}</Button>
              <Button size="sm" variant="destructive">{t('delete')}</Button>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('emailLabel')}</Label>
              <Input placeholder={t('emailPlaceholder')} className="h-8 text-sm" />
            </div>
          </CardContent>
        </Card>

        {/* Notification / list preview */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{t('notifications')}</CardTitle>
              <IconBell className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {notifications.map((item, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 rounded-lg border p-2.5 text-sm ${
                  item.accent ? 'border-primary/30 bg-primary/5' : 'border-border bg-card'
                }`}
              >
                <item.icon className={`h-4 w-4 shrink-0 ${item.accent ? 'text-primary' : 'text-muted-foreground'}`} strokeWidth={1.75} />
                <span className="flex-1 truncate">{item.text}</span>
                <span className="text-xs text-muted-foreground">{item.time}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Stats preview */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('dashboardStats')}</CardTitle>
            <CardDescription>{t('dashboardStatsDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-lg border bg-card p-2.5">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{stat.label}</p>
                  <div className="flex items-baseline gap-1.5 mt-1">
                    <p className="text-lg font-semibold tracking-tight">{stat.value}</p>
                    <span className="text-xs text-primary">{stat.change}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
