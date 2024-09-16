'use client'
import { GithubIcon } from 'lucide-react'
import { toast } from 'sonner'

import { signInWithGitHub } from '@/actions/auth/authActions'
import { Button } from '@/components/ui/button'

export default function GitHubOAuthFlow() {
    const signInWithProvider = async () => {
        try {
            // setError('')
            // Assuming signIn function returns a promise
            const response = await signInWithGitHub()
            console.log(response)
            // if (response.error) {
            //     // Handle login errors (e.g., display error messages)
            //     setError(
            //         response.message || 'An error occurred. Please try again.'
            //     )
            //     toast.error(
            //         response.message || 'An error occurred. Please try again.'
            //     )
            // }
        } catch (error: any) {
            // Handle login errors (e.g., display error messages)
            // setError(error.message || 'An error occurred. Please try again.')
            toast.error(error.message || 'An error occurred. Please try again.')
        }
    }

    return (
        <div className="flex flex-col space-y-2 text-center">
            <Button onClick={signInWithProvider}>
                <GithubIcon className="mr-4" />
                Login with GiHub
            </Button>
        </div>
    )
}
