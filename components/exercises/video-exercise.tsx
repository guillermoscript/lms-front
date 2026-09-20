'use client'

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { IconVideo } from '@tabler/icons-react'
import { VideoRecorderComponent } from './video-recorder'
import ExerciseHeader from './exercise-header'
import ExerciseWorkspace, { initialWorkspacePanel } from './exercise-workspace'
import {
  MediaBriefPanel,
  MediaResultPanel,
  MediaTaskPanel,
  type MediaAttempt,
  type MediaSubmitState,
} from './media-exercise-panels'
import type { SpeechEvaluation } from '@/lib/speech/types'

type SubmissionHistoryItem = MediaAttempt

interface VideoExerciseProps {
  exercise: {
    id: number
    title: string
    description?: string
    instructions: string
    exercise_type: string
    difficulty_level: string
    time_limit?: number
    exercise_config?: {
      topic_prompt?: string
      min_duration_seconds?: number
      max_duration_seconds?: number
      passing_score?: number
      max_daily_attempts?: number
    }
    exercise_completions?: { score?: number; completed_at?: string }[]
  }
  isExerciseCompleted: boolean
  submissionHistory: SubmissionHistoryItem[]
  passingScore: number
  isExerciseCompletedSection?: React.ReactNode
  dailyAttemptsUsed?: number
  maxDailyAttempts?: number
}

// --- Main component ---

export default function VideoExercise({
  exercise,
  isExerciseCompleted,
  submissionHistory: initialHistory,
  passingScore,
  isExerciseCompletedSection,
  dailyAttemptsUsed: serverDailyAttemptsUsed,
  maxDailyAttempts: serverMaxDailyAttempts,
}: VideoExerciseProps) {
  const t = useTranslations('exercises.video')
  const tWorkspace = useTranslations('exercises.workspace')

  const config = exercise.exercise_config ?? {}
  const maxDaily = serverMaxDailyAttempts ?? config.max_daily_attempts ?? 5
  const isUnlimited = maxDaily === 0

  const latestSubmission = initialHistory[0] ?? null
  const latestEvaluation = latestSubmission?.ai_evaluation ?? null

  const [submitState, setSubmitState] = useState<MediaSubmitState>('idle')
  const [evaluation, setEvaluation] = useState<SpeechEvaluation | null>(latestEvaluation)
  const [passed, setPassed] = useState<boolean | undefined>(
    isExerciseCompleted ? true : latestSubmission ? latestSubmission.status === 'completed' : undefined
  )
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [showRecorder, setShowRecorder] = useState(!latestEvaluation)
  const [dailyLimitReached, setDailyLimitReached] = useState(
    !isUnlimited && (serverDailyAttemptsUsed ?? 0) >= maxDaily
  )
  const [attemptsUsed, setAttemptsUsed] = useState(serverDailyAttemptsUsed ?? 0)
  const [submissionHistory, setSubmissionHistory] = useState(initialHistory)
  /** Bumped on every fresh grade so the workspace can surface the result panel. */
  const [gradedNonce, setGradedNonce] = useState(0)

  const completionData = exercise.exercise_completions?.[0]
  const completionScore = completionData?.score ?? evaluation?.score ?? null
  const completionDate = completionData?.completed_at
    ?? submissionHistory.find(s => s.status === 'completed')?.created_at

  const minDuration = config.min_duration_seconds ?? 5
  const maxDuration = config.max_duration_seconds ?? 300

  const handleRecordingComplete = useCallback(async (blob: Blob, duration: number) => {
    setSubmitState('uploading')
    setErrorMsg(null)

    try {
      const uploadRes = await fetch('/api/exercises/media/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exerciseId: exercise.id,
          mediaType: 'video',
          filename: `recording_${Date.now()}.webm`,
        }),
      })

      if (!uploadRes.ok) {
        if (uploadRes.status === 429) {
          try {
            const errData = await uploadRes.json()
            if (errData.error === 'daily_limit_reached') {
              setDailyLimitReached(true)
              setAttemptsUsed(maxDaily)
              setSubmitState('error')
              return
            }
          } catch { /* fall through */ }
        }
        const msg = await uploadRes.text()
        throw new Error(msg || 'Failed to get upload URL')
      }

      const { submissionId, uploadUrl, dailyAttemptsUsed: newUsed } = await uploadRes.json()
      setAttemptsUsed(newUsed)

      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': blob.type || 'video/webm' },
        body: blob,
      })
      if (!putRes.ok) throw new Error('Failed to upload video file')

      setSubmitState('analyzing')

      const analyzeRes = await fetch('/api/exercises/media/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId }),
      })

      if (!analyzeRes.ok) {
        const msg = await analyzeRes.text()
        throw new Error(msg || 'Analysis failed')
      }

      const { evaluation: result, passed: didPass } = await analyzeRes.json()
      setEvaluation(result)
      setPassed(didPass)
      setShowRecorder(false)
      setSubmitState('done')
      setGradedNonce((n) => n + 1)

      setSubmissionHistory(prev => [{
        id: submissionId,
        ai_evaluation: result,
        score: result.score,
        status: didPass ? 'completed' : 'failed',
        submission_id: submissionId,
        created_at: new Date().toISOString(),
        duration_seconds: duration,
      }, ...prev])
    } catch (err) {
      console.error('Video submission error:', err)
      setErrorMsg(err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.')
      setSubmitState('error')
    }
  }, [exercise.id, maxDaily])

  const handleTryAgain = () => {
    setShowRecorder(true)
    setSubmitState('idle')
    setErrorMsg(null)
  }

  // A review is on screen whenever the student is not mid-recording. Then it
  // leads, the prompt folds away, and "record again" trails it; while
  // recording, the prompt and the recorder lead instead.
  const reviewing = !showRecorder && (submissionHistory.length > 0 || isExerciseCompleted)

  const resultPanel =
    submissionHistory.length > 0 || isExerciseCompleted ? (
      <MediaResultPanel
        ns="exercises.video"
        mediaType="video"
        attempts={submissionHistory}
        isCompleted={isExerciseCompleted || passed === true}
        passingScore={passingScore}
        completionScore={completionScore}
        completionDate={completionDate}
        recording={showRecorder}
        onTryAgain={passed !== true && !dailyLimitReached && !showRecorder ? handleTryAgain : undefined}
      />
    ) : undefined

  return (
    <div className="lg:h-full">
      <ExerciseWorkspace
        header={
          <ExerciseHeader
            typeLabel={t('title')}
            title={exercise.title}
            description={exercise.description}
            difficulty={exercise.difficulty_level}
            timeLimit={exercise.time_limit}
            completed={isExerciseCompleted || passed === true}
          />
        }
        brief={
          <MediaBriefPanel
            ns="exercises.video"
            instructions={exercise.instructions}
            topicPrompt={config.topic_prompt}
          />
        }
        task={
          <MediaTaskPanel
            ns="exercises.video"
            recorder={
              <VideoRecorderComponent
                onRecordingComplete={handleRecordingComplete}
                isSubmitting={submitState === 'uploading'}
                minDurationSeconds={minDuration}
                maxDurationSeconds={maxDuration}
                disabled={submitState === 'uploading'}
              />
            }
            recordIcon={<IconVideo size={18} aria-hidden="true" />}
            submitState={submitState}
            errorMsg={errorMsg}
            evaluation={evaluation}
            passed={passed}
            showRecorder={showRecorder}
            dailyLimitReached={dailyLimitReached}
            maxDaily={maxDaily}
            attemptsUsed={attemptsUsed}
            minDuration={minDuration}
            maxDuration={maxDuration}
            onRecordAgain={handleTryAgain}
          />
        }
        taskLabel={tWorkspace('record')}
        result={resultPanel}
        resultPassed={passed}
        related={isExerciseCompletedSection}
        initialPanel={initialWorkspacePanel({
          hasResult: Boolean(resultPanel),
          passed,
          attempted: submissionHistory.length > 0,
        })}
        revealResultNonce={gradedNonce}
        resultFirst={reviewing}
      />
    </div>
  )
}
