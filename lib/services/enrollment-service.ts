/**
 * Enrollment Service
 * 
 * Centralized business logic for course enrollment and access management.
 * Pure functions with no side effects - no DB calls, no UI dependencies.
 * 
 * Key Concepts:
 * - Product-based enrollment: One-time purchase, lifetime access
 * - Subscription-based enrollment: Access while subscription is active
 * - Users can have both types simultaneously for different courses
 */

export interface CourseAccess {
  hasAccess: boolean
  accessType: 'product' | 'subscription' | null
  isExpired: boolean // Only relevant for subscription-based access
  productId?: number
  subscriptionId?: number
  subscriptionEndDate?: Date
}

export interface EnrollmentData {
  enrollmentId: number
  courseId: number
  accessType: 'product' | 'subscription'
  isActive: boolean
  enrolledAt: Date
  subscription?: {
    id: number
    status: string
    endDate: Date
    isExpired: boolean
    planName?: string
  }
  product?: {
    id: number
    name: string
  }
}

/**
 * Determine access status and type from enrollment data
 * 
 * @param enrollment - Raw enrollment data from database
 * @returns CourseAccess object with access details
 */
export function determineAccessStatus(enrollment: {
  product_id?: number | null
  subscription_id?: number | null
  status: string
  subscription?: {
    subscription_status: string
    end_date: string
  } | null
  product?: {
    product_id: number
    name: string
  } | null
}): CourseAccess {
  // Product-based enrollment (lifetime access)
  if (enrollment.product_id && enrollment.status === 'active') {
    return {
      hasAccess: true,
      accessType: 'product',
      isExpired: false,
      productId: enrollment.product_id,
    }
  }

  // Subscription-based enrollment
  if (enrollment.subscription_id && enrollment.subscription) {
    const endDate = new Date(enrollment.subscription.end_date)
    const isExpired = 
      endDate < new Date() || 
      enrollment.subscription.subscription_status !== 'active'

    return {
      hasAccess: !isExpired && enrollment.status === 'active',
      accessType: 'subscription',
      isExpired,
      subscriptionId: enrollment.subscription_id,
      subscriptionEndDate: endDate,
    }
  }

  // No valid enrollment found
  return {
    hasAccess: false,
    accessType: null,
    isExpired: false,
  }
}

/**
 * Check if user should see "Renew Subscription" CTA
 * 
 * @param access - CourseAccess object
 * @returns true if should show renew button
 */
export function shouldShowRenewCTA(access: CourseAccess): boolean {
  return access.accessType === 'subscription' && access.isExpired
}

/**
 * Get badge configuration for course card display
 * 
 * @param access - CourseAccess object
 * @returns Badge text and variant for UI
 */
export function getAccessBadge(access: CourseAccess): {
  text: string
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
} {
  if (access.accessType === 'product') {
    return {
      text: 'Lifetime Access',
      variant: 'default', // Blue badge
    }
  }

  if (access.accessType === 'subscription') {
    if (access.isExpired) {
      return {
        text: 'Subscription Expired',
        variant: 'destructive', // Red badge
      }
    }
    return {
      text: 'Subscription',
      variant: 'secondary', // Gray badge
    }
  }

  return {
    text: 'No Access',
    variant: 'outline',
  }
}

/**
 * Format enrollment data for UI display
 * 
 * @param enrollment - Raw enrollment from database
 * @returns Formatted EnrollmentData object
 */
export function formatEnrollmentData(enrollment: any): EnrollmentData {
  const accessStatus = determineAccessStatus(enrollment)

  return {
    enrollmentId: enrollment.enrollment_id,
    courseId: enrollment.course_id,
    accessType: accessStatus.accessType || 'product',
    isActive: accessStatus.hasAccess,
    enrolledAt: new Date(enrollment.enrollment_date),
    subscription: enrollment.subscription ? {
      id: enrollment.subscription_id,
      status: enrollment.subscription.subscription_status,
      endDate: new Date(enrollment.subscription.end_date),
      isExpired: accessStatus.isExpired,
      planName: enrollment.subscription.plan?.plan_name,
    } : undefined,
    product: enrollment.product ? {
      id: enrollment.product.product_id,
      name: enrollment.product.name,
    } : undefined,
  }
}

/**
 * Check if user has any active subscription
 * 
 * @param subscriptions - Array of user subscriptions
 * @returns true if at least one active subscription exists
 */
export function hasActiveSubscription(subscriptions: Array<{
  subscription_status: string
  end_date: string
}>): boolean {
  return subscriptions.some(sub => 
    sub.subscription_status === 'active' && 
    new Date(sub.end_date) > new Date()
  )
}

/**
 * Get the primary active subscription for display
 * 
 * @param subscriptions - Array of user subscriptions
 * @returns The most recent active subscription or null
 */
export function getPrimarySubscription(subscriptions: Array<{
  subscription_id: number
  subscription_status: string
  end_date: string
  plan?: {
    plan_name: string
  }
}>) {
  const active = subscriptions.filter(sub => 
    sub.subscription_status === 'active' && 
    new Date(sub.end_date) > new Date()
  )

  if (active.length === 0) return null

  // Sort by end_date descending to get the longest-lasting one
  return active.sort((a, b) => 
    new Date(b.end_date).getTime() - new Date(a.end_date).getTime()
  )[0]
}
