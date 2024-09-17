'use client'
import { toast } from 'sonner'

import {
    signInWithGitHub,
    signInWithProvider,
} from '@/actions/auth/authActions'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { Provider } from '@supabase/supabase-js'

export default function LoginWithProvider({
    provider,
    icon,
}: {
    provider: Provider
    icon: any
}) {
    const [loading, setLoading] = useState(false)
    const Init = async () => {
        try {
            setLoading(true)
            const response = await signInWithProvider(provider)
            console.log(response)
        } catch (error: any) {
            setLoading(false)
            toast.error(error.message || 'An error occurred. Please try again.')
        }
    }

    return (
        <div className="flex flex-col space-y-2 text-center">
            <Button
                onClick={Init}
                variant="outline"
                className={`${loading ? 'animate-pulse' : ''}`}
            >
                {icon}
                <span className="capitalize">{provider}</span>
            </Button>
        </div>
    )
}
