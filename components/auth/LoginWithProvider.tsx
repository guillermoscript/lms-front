'use client'
import { Provider } from '@supabase/supabase-js'
import { useState } from 'react'
import { toast } from 'sonner'

import { signInWithProvider } from '@/actions/auth/authActions'
import { Button } from '@/components/ui/button'

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
        <div className="flex flex-col text-center">
            <Button
                onClick={Init}
                variant="outline"
                className={`${
                    loading
                        ? 'animate-pulse'
                        : 'group transition-all ease-out duration-500'
                }`}
            >
                {icon}
                <span className="capitalize group-hover:scale-95">
                    {provider}
                </span>
            </Button>
        </div>
    )
}
