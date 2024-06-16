'use client'

import { useState } from 'react'

import { cancelSubscription } from '@/actions/dashboard/studentActions'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'

export default function CancelSunscriptionForm ({
    userId,
    planId
}: {
    userId: string
    planId: number
}) {
    const [loading, setLoading] = useState(false)
    const { toast } = useToast()

    return (
        <form
            onSubmit={async (e) => {
                e.preventDefault()
                setLoading(true)
                try {
                    const response = await cancelSubscription({ userId, planId })
                    if (response.status === 'error') {
                        toast({
                            title: 'Error cancelling subscription',
                            description: response.message,
                            variant: 'destructive'
                        })
                    } else {
                        toast({
                            title: 'Subscription cancelled successfully'
                        })
                    }
                } catch (error) {
                    toast({
                        title: 'Error cancelling subscription',
                        description: error.message,
                        variant: 'destructive'
                    })
                } finally {
                    setLoading(false)
                }
            }}
        >
            <Button
                disabled={loading}
                variant="destructive"
            >
                {loading ? 'Cancelling subscription...' : 'Cancel subscription'}
            </Button>
        </form>
    )
}
