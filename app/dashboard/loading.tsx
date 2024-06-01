/**
 * v0 by Vercel.
 * @see https://v0.dev/t/vkBhDMemo6s
 * Documentation: https://v0.dev/docs#integrating-generated-code-into-your-nextjs-app
 */
import { Skeleton } from '@/components/ui/skeleton'

export default function Component () {
    return (
        <div className="grid min-h-screen w-full lg:grid-cols-[280px_1fr]">
            <div className="hidden border-r bg-gray-100/40 lg:block dark:bg-gray-800/40">
                <div className="flex h-full max-h-screen flex-col gap-2">
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
            <div className="flex flex-col">
                <main className="flex-1 p-4 md:p-6">
                    <div className="flex items-center">
                        <Skeleton className="h-6 w-40 rounded-md" />
                        <Skeleton className="h-8 w-20 ml-auto rounded-md" />
                    </div>
                    <div className="mt-4 border rounded-lg shadow-sm">
                        <Skeleton className="h-[200px] w-full rounded-t-lg" />
                        <div className="p-4 md:p-6">
                            <div className="space-y-4">
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-full" />
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    )
}
