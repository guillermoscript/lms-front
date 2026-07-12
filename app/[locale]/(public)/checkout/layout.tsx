import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

// Checkout pages are transactional — keep them out of search indexes.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'seo' })
  return {
    title: t('checkout.title'),
    robots: { index: false, follow: false },
  }
}

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return children
}
