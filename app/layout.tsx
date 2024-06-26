import './globals.css'

import { GeistSans } from 'geist/font/sans'

import { ThemeProvider } from '@/components/theme-provider'
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
                <main className="min-h-screen flex flex-col items-center w-full">
                    <ThemeProvider
                        attribute="class"
                        defaultTheme="system"
                        enableSystem
                        disableTransitionOnChange
                    >
                        {children}
                        <Toaster />
                    </ThemeProvider>
                </main>
            </body>
        </html>
    )
}
