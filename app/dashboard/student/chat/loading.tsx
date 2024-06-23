/**
 * v0 by Vercel.
 * @see https://v0.dev/t/vkBhDMemo6s
 * Documentation: https://v0.dev/docs#integrating-generated-code-into-your-nextjs-app
 */
import { Skeleton } from '@/components/ui/skeleton'

export default function Component () {
    return (
        <div className="grid min-h-screen w-full">

            <div className="hidden border-r bg-gray-100/40 lg:block dark:bg-gray-800/40">
                <div className="flex h-full flex-col gap-2 max-h-[calc(100vh-6rem)]">
                    <div className="flex h-[60px] items-center border-b px-6">
                        <Skeleton className="h-6 w-6 rounded-full" />
                        <Skeleton className="h-5 w-24 ml-2" />
                    </div>
                    <div className="flex-1 overflow-auto py-2">
                        <nav className="grid gap-2 px-4">
                            <Skeleton className="h-8 w-full rounded-md" />
                            <Skeleton className="h-8 w-full rounded-md" />
                            <Skeleton className="h-8 w-full rounded-md" />
                            <Skeleton className="h-8 w-full rounded-md" />
                            <Skeleton className="h-8 w-full rounded-md" />
                        </nav>
                    </div>
                    <div className="mt-auto p-4">
                        <Skeleton className="h-[125px] w-full rounded-lg" />
                    </div>
                </div>
            </div>
        </div>
    )
}
