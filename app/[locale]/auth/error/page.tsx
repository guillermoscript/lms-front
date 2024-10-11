import { AlertCircle } from 'lucide-react'

export default function ErrorAuthPage({
    searchParams
}: {
    searchParams: URLSearchParams
}) {
    console.log(searchParams)

    return (
        <div className="flex flex-col items-center justify-center h-full">
            <AlertCircle className="text-red-500 mb-2" size={50} />
            <p className="text-center">
                Error authenticating. Please try again.
            </p>
        </div>
    )
}
