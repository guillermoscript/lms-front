import type { Metadata } from 'next'

// Auth screens must never be indexed by search engines.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children
}
