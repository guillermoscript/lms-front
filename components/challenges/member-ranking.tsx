'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchChallengeRanking, type RankingEntry } from '@/lib/challenges/ranking'
import { Ranking } from './ranking'

interface MemberRankingProps {
  exerciseId: number
  currentUserId?: string
  className?: string
}

/**
 * Logged-in dashboard ranking (RPC, active tenant members only). Guests must
 * use `Ranking` with entries from `getChallengeRankingServer` instead.
 */
export function MemberRanking({ exerciseId, ...rest }: MemberRankingProps) {
  // key resets all state when the exercise changes
  return <MemberRankingInner key={exerciseId} exerciseId={exerciseId} {...rest} />
}

function MemberRankingInner({ exerciseId, currentUserId, className }: MemberRankingProps) {
  const [entries, setEntries] = useState<RankingEntry[] | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchChallengeRanking(createClient(), exerciseId).then(
      (rows) => {
        if (!cancelled) setEntries(rows)
      },
      () => {
        if (!cancelled) setError(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [exerciseId, attempt])

  return (
    <Ranking
      entries={entries ?? []}
      currentUserId={currentUserId}
      className={className}
      status={error ? 'error' : entries === null ? 'loading' : 'ready'}
      onRetry={() => {
        setError(false)
        setEntries(null)
        setAttempt((n) => n + 1)
      }}
    />
  )
}
