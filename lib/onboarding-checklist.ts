export interface ChecklistStepState {
  id: string
  completed: boolean
}

export function getChecklistState<T extends ChecklistStepState>(steps: T[]) {
  const completedSteps = steps.filter((step) => step.completed)
  const nextStepIndex = steps.findIndex((step) => !step.completed)
  const nextStep = nextStepIndex === -1 ? null : steps[nextStepIndex]
  const upcomingSteps = nextStepIndex === -1
    ? []
    : steps.slice(nextStepIndex + 1).filter((step) => !step.completed)

  return {
    allDone: steps.length > 0 && nextStep === null,
    completedCount: completedSteps.length,
    completedSteps,
    nextStep,
    upcomingSteps,
  }
}
