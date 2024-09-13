import { Suspense } from 'react'

import Footer from '@/components/Footer'
import Header from '@/components/Header'
import { Skeleton } from '@/components/ui/skeleton'

export default function Layout ({ children }: { children: React.ReactNode }) {
    return (
        <>
            <Header />
            <>{children}</>
            <Suspense fallback={<>
                <div className="container mx-auto p-4">
                    <Skeleton className="h-16 w-full" />
                </div>
            </>}
            >
                <Footer />
            </Suspense>
        </>
    )
}
