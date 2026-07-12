'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconCircleCheckFilled } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

function CheckoutSuccessInner() {
    const searchParams = useSearchParams();
    const t = useTranslations('checkout.success');

    const type = searchParams.get('type') ?? 'product';
    const isPlan = type === 'plan';

    const primaryHref = isPlan ? '/dashboard/student/browse' : '/dashboard/student/courses';
    const primaryLabel = isPlan ? t('browseCourses') : t('goToCourses');

    return (
        <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
            <Card className="w-full max-w-md border-border shadow-sm">
                <CardContent className="flex flex-col items-center gap-6 px-8 py-10 text-center">
                    {/* Icon */}
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
                        <IconCircleCheckFilled className="h-9 w-9 text-emerald-600 dark:text-emerald-400" />
                    </div>

                    {/* Copy */}
                    <div className="space-y-2">
                        <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
                        <p className="text-sm leading-relaxed text-muted-foreground">{t('subtitle')}</p>
                    </div>

                    {/* CTAs */}
                    <div className="flex w-full flex-col gap-3 pt-2">
                        <Link href={primaryHref} className="w-full">
                            <Button className="w-full">{primaryLabel}</Button>
                        </Link>
                        <Link href="/dashboard/student/billing" className="w-full">
                            <Button variant="outline" className="w-full">{t('viewBilling')}</Button>
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

export default function CheckoutSuccessPage() {
    return (
        <Suspense fallback={null}>
            <CheckoutSuccessInner />
        </Suspense>
    );
}
