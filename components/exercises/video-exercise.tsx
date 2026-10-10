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
import { classifyMediaSubmitFailure, mediaAnalyzeRetry, type MediaAiError } from '@/lib/exercises/media-submit-error'
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
  /** The school's AI setup (key, model, provider) is why the submission was refused. */
  const [aiError, setAiError] = useState<MediaAiError | null>(null)
  /**
   * A recording that is uploaded and counted, whose analysis the school's AI
   * refused. Retry re-analyzes that row: a new upload of the same take would
   * spend another daily attempt (#958).
   */
  const [retrySubmission, setRetrySubmission] = useState<{ submissionId: number; duration: number } | null>(null)
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

  // Analysis of an uploaded recording: the last step of a submission, and all
  // of a retry. `retryOf` is the notice the retry started from, put back when
  // the answer says nothing new about the recording.
  const analyze = useCallback(async (submissionId: number, duration: number, retryOf: MediaAiError | null) => {
    setSubmitState('analyzing')
    setErrorMsg(null)
    setAiError(null)

    try {
      const analyzeRes = await fetch('/api/exercises/media/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId }),
      })

      if (!analyzeRes.ok) {
        const failure = classifyMediaSubmitFailure('analyze', analyzeRes.status, await analyzeRes.text().catch(() => ''))
        const retry = mediaAnalyzeRetry(analyzeRes.status, failure)
        if (failure.kind === 'ai') {
          // Still gradable once the school's AI answers: keep it for Retry.
          setAiError(failure.error)
          setRetrySubmission({ submissionId, duration })
        } else if (retry === 'busy' && retryOf) {
          setAiError(retryOf)
        } else {
          setRetrySubmission(null)
          setErrorMsg(t(failure.kind === 'no_access' ? 'noAccess' : 'analysisFailed'))
        }
        setSubmitState('error')
        return
      }

      const { evaluation: result, passed: didPass } = await analyzeRes.json()
      setRetrySubmission(null)
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
      // A retry that got no answer keeps the recording and its notice.
      if (retryOf) setAiError(retryOf)
      else setErrorMsg(t('analysisFailed'))
      setSubmitState('error')
    }
  }, [t])

  const handleRecordingComplete = useCallback(async (blob: Blob, duration: number) => {
    setSubmitState('uploading')
    setErrorMsg(null)
    setAiError(null)
    // A new recording never re-analyzes the one before it.
    setRetrySubmission(null)

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
        // The body is read once and never printed: it is plain English text or
        // raw JSON, and a second read of a consumed body throws.
        const failure = classifyMediaSubmitFailure('upload-url', uploadRes.status, await uploadRes.text().catch(() => ''))
        if (failure.kind === 'daily_limit') {
          setDailyLimitReached(true)
          setAttemptsUsed(maxDaily)
        } else if (failure.kind === 'ai') {
          setAiError(failure.error)
        } else if (failure.kind === 'too_many_pending') {
          setErrorMsg(t('tooManyPending'))
        } else {
          setErrorMsg(t(failure.kind === 'no_access' ? 'noAccess' : 'submitFailed'))
        }
        setSubmitState('error')
        return
      }

      const { submissionId, uploadUrl, dailyAttemptsUsed: newUsed } = await uploadRes.json()
      setAttemptsUsed(newUsed)

      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': blob.type || 'video/webm' },
        body: blob,
      })
      if (!putRes.ok) throw new Error('Failed to upload video file')

      await analyze(submissionId, duration, null)
    } catch (err) {
      console.error('Video submission error:', err)
      setErrorMsg(t('submitFailed'))
      setSubmitState('error')
    }
  }, [exercise.id, maxDaily, t, analyze])

  const handleTryAgain = () => {
    setShowRecorder(true)
    setSubmitState('idle')
    setErrorMsg(null)
    setAiError(null)
    setRetrySubmission(null)
  }

  // Same recording, same row: no upload-url, so no new daily attempt.
  const handleRetryAnalysis = () => {
    if (retrySubmission) void analyze(retrySubmission.submissionId, retrySubmission.duration, aiError)
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
            aiError={aiError}
            evaluation={evaluation}
            passed={passed}
            showRecorder={showRecorder}
            dailyLimitReached={dailyLimitReached}
            maxDaily={maxDaily}
            attemptsUsed={attemptsUsed}
            minDuration={minDuration}
            maxDuration={maxDuration}
            onRecordAgain={handleTryAgain}
            onRetryAnalysis={retrySubmission ? handleRetryAnalysis : undefined}
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
