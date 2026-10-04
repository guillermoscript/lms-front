'use client'

import { SegmentError, type SegmentErrorProps } from '@/components/shared/segment-error'

/** #677: keeps the surrounding layout; only this page's panel is replaced. */
export default function AuthError(props: SegmentErrorProps) {
  return <SegmentError {...props} back="login" />
}
