import { describe, it, expect } from 'vitest'

import { initialWorkspacePanel } from '../../components/exercises/exercise-workspace'

/**
 * Pins which panel a phone opens on when a student lands on an exercise.
 *
 * The workspace shows one panel at a time below `lg`, so this choice is the
 * whole first impression: pick wrong and the student either lands on a task
 * whose instructions they have not read, or has to hunt for feedback that is
 * the only reason they came back.
 *
 * Contract, in priority order:
 *   1. A graded attempt they did NOT pass wins. That is the same rule
 *      `shouldAutoExpandCheckpoint` uses inside a lesson, deliberately.
 *   2. Otherwise, anyone who has attempted before goes straight to the work.
 *   3. A first-time student reads the brief.
 */

describe('initialWorkspacePanel', () => {
  it('opens the result for a graded attempt the student did not pass', () => {
    expect(initialWorkspacePanel({ hasResult: true, passed: false, attempted: true })).toBe('result')
  })

  it('opens the task for a passed attempt — the result is a receipt, not a task', () => {
    expect(initialWorkspacePanel({ hasResult: true, passed: true, attempted: true })).toBe('task')
  })

  it('opens the brief for a first-time student', () => {
    expect(initialWorkspacePanel({ hasResult: false, attempted: false })).toBe('brief')
  })

  it('opens the task for a returning student with no grade yet', () => {
    // Attempted but ungraded: they have read the brief, so send them to the work.
    expect(initialWorkspacePanel({ hasResult: false, attempted: true })).toBe('task')
  })

  it('ignores a failure flag with no result to show', () => {
    // `passed: false` without a result panel would otherwise select an empty
    // tab that is not even rendered.
    expect(initialWorkspacePanel({ hasResult: false, passed: false, attempted: false })).toBe('brief')
  })

  it('treats an ungraded result as nothing to act on', () => {
    // `passed` is undefined for engines that record a completion without a
    // verdict; that is not a failure and must not hijack the first screen.
    expect(initialWorkspacePanel({ hasResult: true, passed: undefined, attempted: true })).toBe('task')
  })
})
