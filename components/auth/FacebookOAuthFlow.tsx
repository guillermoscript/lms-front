'use client'
import { toast } from 'sonner'

import { signInWithFacebook } from '@/actions/auth/authActions'
import { Button } from '@/components/ui/button'

export default function FacebookOAuthFlow() {
    const signInWithProvider = async () => {
        try {
            // setError('')
            // Assuming signIn function returns a promise
            const response = await signInWithFacebook()
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
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    x="0px"
                    y="0px"
                    width="25"
                    height="25"
                    viewBox="0 0 48 48"
                    className="mr-4"
                >
                    <path
                        fill="#3F51B5"
                        d="M42,37c0,2.762-2.238,5-5,5H11c-2.761,0-5-2.238-5-5V11c0-2.762,2.239-5,5-5h26c2.762,0,5,2.238,5,5V37z"
                    ></path>
                    <path
                        fill="#FFF"
                        d="M34.368,25H31v13h-5V25h-3v-4h3v-2.41c0.002-3.508,1.459-5.59,5.592-5.59H35v4h-2.287C31.104,17,31,17.6,31,18.723V21h4L34.368,25z"
                    ></path>
                </svg>
                Login with Facebook
            </Button>
        </div>
    )
}
