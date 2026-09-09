'use client'

import { SegmentError, type SegmentErrorProps } from '@/components/shared/segment-error'

/** #677: keeps the surrounding layout; only this page's panel is replaced. */
export default function VerifyError(props: SegmentErrorProps) {
  return <SegmentError {...props} back="home" />
}
