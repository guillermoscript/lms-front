'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import type { LessonCheckpointClientData } from '@/lib/checkpoints/load'
import type { CheckpointAttemptResult } from '@/lib/checkpoints/types'

export interface CheckpointsContextValue {
  /** Initial checkpoint data merged with any results recorded this session. */
  checkpoints: LessonCheckpointClientData[]
  courseId: number
  getCheckpoint: (checkpointId: number) => LessonCheckpointClientData | undefined
  recordResult: (checkpointId: number, result: CheckpointAttemptResult) => void
  allRequiredCompleted: boolean
  missingRequired: number
}

const CheckpointsContext = createContext<CheckpointsContextValue | null>(null)

/** Returns null outside a CheckpointsProvider — callers must treat that as "no gating". */
export function useCheckpoints(): CheckpointsContextValue | null {
  return useContext(CheckpointsContext)
}

interface CheckpointsProviderProps {
  checkpoints: LessonCheckpointClientData[]
  courseId: number
  children: ReactNode
}

export function CheckpointsProvider({
  checkpoints: initialCheckpoints,
  courseId,
  children,
}: CheckpointsProviderProps) {
  const [results, setResults] = useState<Record<number, CheckpointAttemptResult>>({})

  const checkpoints = initialCheckpoints.map((cp) => {
    const result = results[cp.id]
    if (!result) return cp
    return {
      ...cp,
      attemptCount: result.attemptNumber,
      latestAttempt: {
        attemptNumber: result.attemptNumber,
        completed: result.completed,
        passed: result.passed,
        score: result.score,
        evaluatorType: result.evaluatorType,
      },
    }
  })

  function getCheckpoint(checkpointId: number) {
    return checkpoints.find((cp) => cp.id === checkpointId)
  }

  function recordResult(checkpointId: number, result: CheckpointAttemptResult) {
    setResults((prev) => ({ ...prev, [checkpointId]: result }))
  }

  const requiredCheckpoints = checkpoints.filter((cp) => cp.isRequired)
  const missingRequired = requiredCheckpoints.filter(
    (cp) => cp.latestAttempt?.completed !== true
  ).length

  const value: CheckpointsContextValue = {
    checkpoints,
    courseId,
    getCheckpoint,
    recordResult,
    allRequiredCompleted: missingRequired === 0,
    missingRequired,
  }

  return <CheckpointsContext.Provider value={value}>{children}</CheckpointsContext.Provider>
}
