/**
 * v0 by Vercel.
 * @see https://v0.dev/t/BKPA4ycK47u
 * Documentation: https://v0.dev/docs#integrating-generated-code-into-your-nextjs-app
 */
import { CheckCircleIcon } from 'lucide-react'
import Link from 'next/link'

export default function Component ({ params }: { params: any }) {
    console.log(params)
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
            <div className="max-w-md w-full bg-white dark:bg-gray-800 shadow-lg rounded-lg p-8 space-y-6">
                <div className="flex flex-col items-center">
                    <CheckCircleIcon className="h-16 w-16 text-green-500" />
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-4">
                        Thank you!
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-2">
                        Your payment was successful.
                    </p>
                </div>
                <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                    <p className="text-gray-600 dark:text-gray-400 text-sm">
                        You will receive a confirmation email with the details
                        of your purchase.
                    </p>
                    <div className="flex justify-center mt-4">
                        <Link
                            className="inline-flex items-center justify-center px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-md shadow-sm text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 dark:bg-gray-700 dark:hover:bg-gray-600 dark:focus:ring-gray-600"
                            href="#"
                        >
                            Go back to home
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    )
}
