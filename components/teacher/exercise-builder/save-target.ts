type SaveResult = { success: true; data: { exerciseId: number } } | { success: false; error: string }

/**
 * Decides create-vs-update for one builder instance (#796).
 *
 * The builder used to branch on the `initialData` prop, which stays undefined
 * on `/exercises/new` after the first Save Draft, so every further save
 * inserted another exercise. The id the first create returns is kept here, and
 * a save fired while another is in flight (a double click lands before React
 * re-renders the disabled button) is dropped instead of racing a second create.
 */
export function createExerciseSaveTarget(initialId?: number) {
  let id: number | null = initialId ?? null
  let inFlight = false

  return {
    get id() {
      return id
    },
    /** `null` when the call was dropped because a save is already running. */
    async save(
      create: () => Promise<SaveResult>,
      update: (id: number) => Promise<SaveResult>
    ): Promise<SaveResult | null> {
      if (inFlight) return null
      inFlight = true
      try {
        const result = id === null ? await create() : await update(id)
        if (result.success && id === null) id = result.data.exerciseId
        return result
      } finally {
        inFlight = false
      }
    },
  }
}
