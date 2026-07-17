'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import {
    Elements,
    PaymentElement,
    useElements,
    useStripe,
} from '@stripe/react-stripe-js';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import {
    IconLoader2,
    IconLock,
    IconAlertTriangle,
    IconBuildingBank,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';

interface StripePaymentFormProps {
    productId?: number | string;
    planId?: number | string;
    price: number | string;
    currency?: string;
    /** When the school also offers manual/offline payment, link to it on error. */
    hasManualFallback?: boolean;
}

// A module-level singleton — loadStripe should run once, not per render.
let stripePromise: Promise<Stripe | null> | null = null;
function getStripePromise() {
    if (!stripePromise) {
        stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
    }
    return stripePromise;
}

export function StripePaymentForm({
    productId,
    planId,
    price,
    currency,
    hasManualFallback,
}: StripePaymentFormProps) {
    const t = useTranslations('checkout');
    const [clientSecret, setClientSecret] = useState<string | null>(null);
    const [transactionId, setTransactionId] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const fetchedRef = useRef(false);

    // Fetch the PaymentIntent / subscription client secret on mount. The webhook
    // grants enrollment on payment_intent.succeeded — nothing is granted here.
    useEffect(() => {
        // One intent per mount — a re-run (e.g. translator identity change)
        // must not create another pending transaction.
        if (fetchedRef.current) return;
        fetchedRef.current = true;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/api/stripe/create-payment-intent', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ productId, planId }),
                });
                const data = await res.json();
                if (!res.ok || !data.clientSecret) {
                    throw new Error(data.error || t('stripe.initError'));
                }
                if (cancelled) return;
                setClientSecret(data.clientSecret);
                setTransactionId(data.transactionId);
            } catch (err) {
                if (cancelled) return;
                setError(err instanceof Error ? err.message : String(err));
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [productId, planId, t]);

    const manualHref = productId
        ? `/checkout/manual?productId=${productId}`
        : `/checkout/manual?planId=${planId}`;

    if (error) {
        return (
            <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                    <IconAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="space-y-1">
                        <p className="font-medium">{t('stripe.unavailableTitle')}</p>
                        <p>{error}</p>
                    </div>
                </div>
                {hasManualFallback && (
                    <Link href={manualHref} className="block">
                        <Button variant="outline" className="w-full">
                            <IconBuildingBank className="mr-2 h-4 w-4" />
                            {t('stripe.tryManual')}
                        </Button>
                    </Link>
                )}
            </div>
        );
    }

    if (!clientSecret || transactionId === null) {
        // Loading skeleton while the intent is created.
        return (
            <div className="space-y-4" aria-busy="true">
                <div className="h-10 animate-pulse rounded-lg bg-muted" />
                <div className="h-10 animate-pulse rounded-lg bg-muted" />
                <div className="grid grid-cols-2 gap-3">
                    <div className="h-10 animate-pulse rounded-lg bg-muted" />
                    <div className="h-10 animate-pulse rounded-lg bg-muted" />
                </div>
                <div className="flex items-center justify-center gap-2 pt-1 text-xs text-muted-foreground">
                    <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
                    {t('stripe.preparing')}
                </div>
            </div>
        );
    }

    return (
        <Elements stripe={getStripePromise()} options={{ clientSecret }}>
            <StripeCheckoutInner
                transactionId={transactionId}
                price={price}
                currency={currency}
            />
        </Elements>
    );
}

function StripeCheckoutInner({
    transactionId,
    price,
    currency,
}: {
    transactionId: number;
    price: number | string;
    currency?: string;
}) {
    const stripe = useStripe();
    const elements = useElements();
    const locale = useLocale();
    const t = useTranslations('checkout');
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const displayPrice = useMemo(() => {
        if (typeof price === 'number') {
            return `${currency ? currency.toUpperCase() + ' ' : '$'}${price}`;
        }
        return price;
    }, [price, currency]);

    const handleSubmit = async () => {
        if (!stripe || !elements) return;
        setSubmitting(true);
        setSubmitError(null);

        const { error } = await stripe.confirmPayment({
            elements,
            confirmParams: {
                return_url: `${window.location.origin}/${locale}/checkout/success?transactionId=${transactionId}`,
            },
        });

        // If we reach here, confirmation failed before the redirect (validation
        // or immediate card error). On success Stripe redirects to return_url.
        if (error) {
            setSubmitError(error.message || t('stripe.paymentError'));
            setSubmitting(false);
        }
    };

    return (
        <div className="space-y-5">
            <PaymentElement />

            {submitError && (
                <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs leading-relaxed text-destructive">
                    <IconAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    {submitError}
                </p>
            )}

            <Button
                className="w-full"
                onClick={handleSubmit}
                disabled={!stripe || !elements || submitting}
            >
                {submitting && <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />}
                {submitting
                    ? t('payment.processing')
                    : t('stripe.payButton', { price: displayPrice })}
            </Button>

            <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                <IconLock className="h-3 w-3" />
                {t('secureCheckout')}
            </p>
        </div>
    );
}
