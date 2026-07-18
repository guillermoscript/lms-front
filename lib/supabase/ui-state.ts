import { createClient } from '@/lib/supabase/server'
import type { UiStateMap } from '@/lib/ui-state-keys'

// Server-side read of a user's persisted UI state (tours, checklists, tips).
// user_ui_state is global per-user (no tenant_id) with own-row RLS, so the
// RLS-scoped client only ever sees the caller's rows; the explicit filter is
// kept for clarity. Read once per page and pass values down as props.
export async function getUiState(userId: string): Promise<UiStateMap> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('user_ui_state')
    .select('key, value')
    .eq('user_id', userId)

  if (error) {
    console.error('getUiState error:', error)
    return {}
  }

  return Object.fromEntries((data ?? []).map((row) => [row.key, row.value]))
}
