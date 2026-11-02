'use client'

import { SegmentError, type SegmentErrorProps } from '@/components/shared/segment-error'

export default function ChallengeError(props: SegmentErrorProps) {
  return <SegmentError {...props} back="home" />
}
