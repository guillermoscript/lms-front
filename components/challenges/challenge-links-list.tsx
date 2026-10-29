'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  deactivateChallengeLink,
  listChallengeLinks,
  type ChallengeLinkRow,
} from '@/app/actions/challenge-links'

export function ChallengeLinksList() {
  const t = useTranslations('challenges.admin.links')
  const [rows, setRows] = useState<ChallengeLinkRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await listChallengeLinks().catch(() => null)
    if (res?.success) {
      setFailed(false)
      setRows(res.data)
    } else setFailed(true)
  }, [])

  useEffect(() => {
    let cancelled = false
    listChallengeLinks()
      .then((res) => (res.success ? res : null), () => null)
      .then((res) => {
        if (cancelled) return
        if (res) setRows(res.data)
        else setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function deactivate(id: string) {
    setBusyId(id)
    try {
      const res = await deactivateChallengeLink(id)
      if (res.success) {
        toast.success(t('deactivated'))
        setRows((prev) => prev?.map((r) => (r.id === id ? { ...r, active: false } : r)) ?? prev)
      } else {
        toast.error(t('error'))
      }
    } catch {
      toast.error(t('error'))
    } finally {
      setBusyId(null)
    }
  }

  if (failed) {
    return (
      <div className="space-y-2" role="alert">
        <p className="text-sm text-destructive">{t('loadError')}</p>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          {t('retry')}
        </Button>
      </div>
    )
  }
  if (rows === null) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {t('loading')}
      </p>
    )
  }
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{t('empty')}</p>

  return (
    <ul className="divide-y rounded-lg border" data-testid="challenge-links-list">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0 space-y-0.5">
            <p className="truncate font-medium">{row.exerciseTitle || t('untitled')}</p>
            <p className="text-sm text-muted-foreground">
              {row.score !== null && <>{t('score', { score: row.score })} · </>}
              {row.active ? t('active') : t('inactive')} ·{' '}
              {new Date(row.createdAt).toLocaleDateString()}
            </p>
          </div>
          {row.active && (
            <Button
              variant="outline"
              size="sm"
              disabled={busyId === row.id}
              onClick={() => void deactivate(row.id)}
            >
              {busyId === row.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('deactivate')}
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}
