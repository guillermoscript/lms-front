import './globals.css'

import { GeistSans } from 'geist/font/sans'

// In app directory
import ProgressBarProvider from '@/components/provider/ProgressBarProvider'
import ScrollToTopButton from '@/components/ScrollToTopButton'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster as SoonerToaster } from '@/components/ui/sonner'
import { Toaster } from '@/components/ui/toaster'

const defaultUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'

export const metadata = {
    metadataBase: new URL(defaultUrl),
    title: 'Next.js and Supabase AI powered LMS',
    description: 'The fastest way to learn about programming'
}

export default function RootLayout ({
    children
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en"
            className={GeistSans.className}
        >
            <body>
                <ProgressBarProvider />
                <main className="min-h-screen flex flex-col items-center w-full">
                    <ThemeProvider
                        attribute="class"
                        defaultTheme="system"
                        enableSystem
                        disableTransitionOnChange
                    >
                        {children}
                        <Toaster />
                        <SoonerToaster />
                        <ScrollToTopButton />
                    </ThemeProvider>
                </main>
            </body>
        </html>
    )
}
