'use client'

import { AppProgressBar } from 'next-nprogress-bar'

export function RouteProgress() {
  return (
    <AppProgressBar
      height="3px"
      color="var(--primary)"
      options={{ showSpinner: false }}
      shallowRouting
    />
  )
}
