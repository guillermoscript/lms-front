import * as Sentry from '@sentry/nextjs'

/**
 * Opens the Sentry user-feedback dialog.
 *
 * The feedback integration is configured with `autoInject: false` (see
 * `instrumentation-client.ts`) so the SDK never plants its own fixed
 * bottom-right actor button, which collided with the primary action in the
 * lesson footer on mobile. Every entry point calls this instead.
 *
 * Returns `false` when the integration isn't available (SDK still loading, or
 * blocked by an ad blocker) so callers can stay silent rather than appear broken.
 */
export async function openFeedbackDialog(): Promise<boolean> {
  const feedback = Sentry.getFeedback()
  if (!feedback) return false

  // The dialog is torn down on close so repeated opens don't stack copies of
  // the form inside the shadow root.
  let dialog: Awaited<ReturnType<typeof feedback.createForm>> | undefined
  const dismiss = () => dialog?.removeFromDom()

  try {
    dialog = await feedback.createForm({
      onFormClose: dismiss,
      onFormSubmitted: dismiss,
    })
  } catch (error) {
    Sentry.captureException(error)
    return false
  }

  dialog.appendToDom()
  dialog.open()
  return true
}

/** True once the feedback integration is live and `openFeedbackDialog` will work. */
export function isFeedbackAvailable(): boolean {
  return !!Sentry.getFeedback()
}

/**
 * Aligns the dialog with the app's resolved theme. `colorScheme: 'system'` follows
 * the OS, which is wrong whenever the user has overridden the theme in-app.
 */
export function syncFeedbackTheme(theme: 'light' | 'dark'): void {
  Sentry.getFeedback()?.setTheme(theme)
}
