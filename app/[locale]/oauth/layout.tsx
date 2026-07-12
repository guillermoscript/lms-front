import type { Metadata } from 'next'

// OAuth consent screens must never be indexed by search engines.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function OAuthLayout({ children }: { children: React.ReactNode }) {
  return children
}
