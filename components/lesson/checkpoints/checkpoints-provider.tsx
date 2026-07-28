'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import type { LessonCheckpointClientData } from '@/lib/checkpoints/load'
import {
  shouldAutoExpandCheckpoint,
  type CheckpointAttemptResult,
  type SubmittedCheckpointResponse,
} from '@/lib/checkpoints/types'

export interface CheckpointsContextValue {
  /** Initial checkpoint data merged with any results recorded this session. */
  checkpoints: LessonCheckpointClientData[]
  courseId: number
  getCheckpoint: (checkpointId: number) => LessonCheckpointClientData | undefined
  /** `submitted` is the student's own answer; it is not part of the server's
   * grading response, so the form hands it over to keep `latestAttempt` a
   * complete mirror of what a page reload would restore. */
  recordResult: (
    checkpointId: number,
    result: CheckpointAttemptResult,
    submitted?: SubmittedCheckpointResponse
  ) => void
  /** Full result of the last attempt made THIS session (incl. per-question
   * feedback). Lives here, not in the card, because the MDX tree remounts on
   * every provider update and would otherwise drop the feedback on submit. */
  getResult: (checkpointId: number) => CheckpointAttemptResult | null
  isExpanded: (checkpointId: number) => boolean
  setExpanded: (checkpointId: number, expanded: boolean) => void
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
  const [submissions, setSubmissions] = useState<Record<number, SubmittedCheckpointResponse>>({})
  const [expandedIds, setExpandedIds] = useState<Record<number, boolean>>({})

  const checkpoints = initialCheckpoints.map((cp) => {
    const result = results[cp.id]
    if (!result) return cp
    const submitted = submissions[cp.id] ?? {}
    return {
      ...cp,
      attemptCount: result.attemptNumber,
      latestAttempt: {
        attemptNumber: result.attemptNumber,
        completed: result.completed,
        passed: result.passed,
        score: result.score,
        evaluatorType: result.evaluatorType,
        feedback: result.feedback,
        nextStepHint: result.nextStepHint,
        perQuestion: result.perQuestion,
        aiUnavailable: result.aiUnavailable,
        submittedText: submitted.text,
        submittedAnswers: submitted.answers,
      },
    }
  })

  function getCheckpoint(checkpointId: number) {
    return checkpoints.find((cp) => cp.id === checkpointId)
  }

  function recordResult(
    checkpointId: number,
    result: CheckpointAttemptResult,
    submitted?: SubmittedCheckpointResponse
  ) {
    setResults((prev) => ({ ...prev, [checkpointId]: result }))
    if (submitted) setSubmissions((prev) => ({ ...prev, [checkpointId]: submitted }))
  }

  function getResult(checkpointId: number) {
    return results[checkpointId] ?? null
  }

  /**
   * Collapsed by default, EXCEPT when the student has a graded attempt they did
   * not pass. That is the one case where the card holds something they need to
   * act on — the AI's feedback and next-step hint — and leaving it behind a
   * chevron meant a returning student saw only a score chip. An explicit
   * toggle still wins, so they can close it.
   */
  function isExpanded(checkpointId: number) {
    const stored = expandedIds[checkpointId]
    if (stored !== undefined) return stored
    return shouldAutoExpandCheckpoint(getCheckpoint(checkpointId)?.latestAttempt)
  }

  function setExpanded(checkpointId: number, expanded: boolean) {
    setExpandedIds((prev) => ({ ...prev, [checkpointId]: expanded }))
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
    getResult,
    isExpanded,
    setExpanded,
    allRequiredCompleted: missingRequired === 0,
    missingRequired,
  }

  return <CheckpointsContext.Provider value={value}>{children}</CheckpointsContext.Provider>
}
