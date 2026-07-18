// Shared key vocabulary for the user_ui_state table (issue #452).
// Pure module — safe to import from both server and client code.
// Keys are namespaced so the table doesn't become a junk drawer; the
// setUiState/clearUiState server actions enforce the same shapes.

export const TOURS_ENABLED_KEY = 'tours_enabled'

export function tourStateKey(tourId: string): string {
  return `tour:${tourId}`
}

export function checklistStateKey(checklistId: string): string {
  return `checklist:${checklistId}`
}

export type UiStateMap = Record<string, unknown>

export function isTourCompleted(state: UiStateMap, tourId: string): boolean {
  return state[tourStateKey(tourId)] === 'completed'
}

// Absent row means enabled — only an explicit false disables tours.
export function areToursEnabled(state: UiStateMap): boolean {
  return state[TOURS_ENABLED_KEY] !== false
}

export function isChecklistDismissed(state: UiStateMap, checklistId: string): boolean {
  return state[checklistStateKey(checklistId)] === 'dismissed'
}
