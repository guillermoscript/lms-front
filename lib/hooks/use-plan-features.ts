'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PlanInfo, PlanFeatures, PlanLimits } from '@/lib/plans/features'

const DEFAULT_FEATURES: PlanFeatures = {
  leaderboard: false,
  achievements: false,
  store: false,
  certificates: 'basic',
  analytics: false,
  ai_grading: false,
  custom_branding: false,
  custom_domain: false,
  api_access: false,
  white_label: false,
  priority_support: false,
  xp: true,
  levels: true,
  streaks: true,
  landing_pages: false,
  remove_branding: false,
  voice_exercises: false,
  community: false,
}

const DEFAULT_LIMITS: PlanLimits = {
  max_courses: 5,
  max_students: 50,
}

export function usePlanFeatures() {
  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchFeatures() {
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()

        if (!session?.access_token) {
          setLoading(false)
          return
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        if (!supabaseUrl) {
          setLoading(false)
          return
        }

        const response = await fetch(`${supabaseUrl}/functions/v1/get-plan-features`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: '{}',
        })

        if (!response.ok) throw new Error('Failed to fetch plan features')

        const data = await response.json()
        if (!cancelled) {
          setPlanInfo(data)
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchFeatures()
    return () => { cancelled = true }
  }, [])

  return {
    plan: planInfo?.plan || 'free',
    planName: planInfo?.plan_name || 'Free',
    features: planInfo?.features || DEFAULT_FEATURES,
    limits: planInfo?.limits || DEFAULT_LIMITS,
    transactionFeePercent: planInfo?.transaction_fee_percent ?? 10,
    loading,
    error,
  }
}
