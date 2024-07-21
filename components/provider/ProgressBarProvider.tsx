// Create a Providers component to wrap your application with all the components requiring 'use client', such as next-nprogress-bar or your different contexts...
'use client'
import dynamic from 'next/dynamic'

import { Skeleton } from '../ui/skeleton'
const AppProgressBar = dynamic(
    async () => (await import('next-nprogress-bar')).AppProgressBar,
    {
        loading: () => (
            <Skeleton
                className="fixed top-0 left-0 w-full h-1 bg-primary"
                style={{ zIndex: 9999 }}
            />
        ),
        ssr: false
    }
)

const ProgressBarProvider = () => {
    return (
        <AppProgressBar
            height="4px"
            color='#7c3aed'
            options={{ showSpinner: false }}
            shallowRouting
        />
    )
}

export default ProgressBarProvider
