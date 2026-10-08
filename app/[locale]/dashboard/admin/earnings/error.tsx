'use client'

import { SegmentError, type SegmentErrorProps } from '@/components/shared/segment-error'

export default function AdminEarningsError(props: SegmentErrorProps) {
  return <SegmentError {...props} back="dashboard" backHref="/dashboard/admin" />
}
