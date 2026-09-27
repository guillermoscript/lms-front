import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import { IconCircleCheck } from '@tabler/icons-react'
import { APP_NAME } from '@/lib/app-name'
import { buildPageMetadata } from '@/lib/seo'
import { Button } from '@/components/ui/button'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'deleteAccountPage' })
  return buildPageMetadata({ title: t('metaTitle'), description: t('metaDescription'), path: '/delete-account', locale })
}

/**
 * Public "how to delete your account" page (#850). Google Play asks for a URL
 * the listing can link to that explains deletion without installing the app;
 * the deletion itself happens signed in, from the profile/settings card.
 */
export default async function DeleteAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>
}) {
  const { deleted } = await searchParams
  const t = await getTranslations('deleteAccountPage')

  return (
    <div className="container mx-auto max-w-2xl px-4 py-16 md:py-24">
      {deleted === '1' && (
        <div
          role="status"
          className="mb-10 flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4 text-sm"
        >
          <IconCircleCheck size={20} className="mt-0.5 shrink-0 text-primary" aria-hidden />
          <p>{t('deletedNotice')}</p>
        </div>
      )}

      <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
      <p className="mt-3 text-muted-foreground">{t('intro', { appName: APP_NAME })}</p>

      <section className="mt-10 space-y-3">
        <h2 className="text-lg font-semibold">{t('stepsTitle')}</h2>
        <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
          <li>{t('steps.signIn')}</li>
          <li>{t('steps.open')}</li>
          <li>{t('steps.confirm')}</li>
        </ol>
        <p className="text-sm text-muted-foreground">{t('app')}</p>
        <Link href="/dashboard/settings" className="inline-block pt-2">
          <Button>{t('cta')}</Button>
        </Link>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-lg font-semibold">{t('removedTitle')}</h2>
        <p className="text-muted-foreground">{t('removed')}</p>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-lg font-semibold">{t('keptTitle')}</h2>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>{t('kept.payments')}</li>
          <li>{t('kept.content')}</li>
        </ul>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-lg font-semibold">{t('beforeTitle')}</h2>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>{t('before.subscription')}</li>
          <li>{t('before.admin')}</li>
        </ul>
      </section>

      <p className="mt-10 text-sm text-muted-foreground">{t('final')}</p>
    </div>
  )
}
