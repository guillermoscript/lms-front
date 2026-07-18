import { describe, expect, it } from 'vitest'
import { getChecklistState } from '@/lib/onboarding-checklist'
import { shouldStartTour } from '@/lib/tour-policy'

describe('onboarding orchestration', () => {
  it('promotes the first incomplete step and keeps later work secondary', () => {
    const steps = [
      { id: 'course', completed: true },
      { id: 'payments', completed: false },
      { id: 'brand', completed: true },
      { id: 'invite', completed: false },
    ]

    expect(getChecklistState(steps)).toMatchObject({
      allDone: false,
      completedCount: 2,
      nextStep: steps[1],
      upcomingSteps: [steps[3]],
    })
  })

  it('reports completion when every step is done', () => {
    expect(getChecklistState([
      { id: 'course', completed: true },
      { id: 'payments', completed: true },
    ])).toMatchObject({
      allDone: true,
      nextStep: null,
      upcomingSteps: [],
    })
  })

  it('starts tours only after an explicit user request', () => {
    expect(shouldStartTour(false)).toBe(false)
    expect(shouldStartTour(true)).toBe(true)
  })
})
