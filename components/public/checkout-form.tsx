'use client';

import { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { enrollUser, enrollFree } from '@/app/[locale]/(public)/checkout/actions';
import { createPaymentRequest } from '@/app/actions/payment-requests';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useTranslations } from 'next-intl';
import {
    IconLoader2,
    IconCreditCard,
    IconBuildingBank,
    IconCheck,
    IconLock,
    IconCalendar,
} from '@tabler/icons-react';

interface CheckoutFormProps {
    courseId?: string;
    planId?: string;
    title: string;
    description?: string | null;
    price: number | string;
    formattedPrice?: string | null;
    productId?: number;
    durationDays?: number;
    features?: string | null;
    userName?: string;
    userEmail?: string;
    paymentProvider?: string | null;
}

export function CheckoutForm({
    courseId,
    planId,
    title,
    description,
    price,
    formattedPrice,
    productId,
    durationDays,
    features,
    userName,
    userEmail,
    paymentProvider,
}: CheckoutFormProps) {
    const [loading, setLoading] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState<'card' | 'offline'>('card');
    const [offlineData, setOfflineData] = useState({
        name: userName || '',
        email: userEmail || '',
        phone: '',
        message: ''
    });
    const router = useRouter();
    const t = useTranslations('checkout');

    // Provider-agnostic checkout (#280 Phase 4/5): Lemon Squeezy = hosted
    // redirect, Solana = QR + on-chain poll. Other providers use the inline flow.
    const isRedirectProvider = paymentProvider === 'lemonsqueezy';
    const isQrProvider = paymentProvider === 'solana';
    const [solanaQr, setSolanaQr] = useState<string | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Clean up the Solana poll on unmount.
    useEffect(() => {
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, []);

    const isFree = typeof price === 'number' ? price === 0 : price === t('free')
    const showOfflineTab = !paymentProvider || paymentProvider === 'manual';
    const displayPrice = formattedPrice || (typeof price === 'number' ? `$${price}` : price);

    // Parse features string into list (features are stored as newline or comma-separated text)
    const featureList = features
        ? features.split(/[\n,]+/).map(f => f.trim()).filter(Boolean)
        : [];

    // Real provider checkout (Lemon Squeezy redirect / Solana QR). Returns true
    // if it handled the flow, false to fall back to the inline/mock path.
    const startProviderCheckout = async (): Promise<boolean> => {
        if (!isRedirectProvider && !isQrProvider) return false;

        const res = await fetch('/api/payments/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ planId: planId ? parseInt(planId) : undefined, productId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Checkout failed');

        if (data.kind === 'redirect' && data.url) {
            // Lemon Squeezy hosted checkout — leave the app.
            window.location.href = data.url;
            return true;
        }

        if (data.kind === 'qr' && data.url) {
            // Solana Pay — render the transfer-request URL as a QR and poll the
            // verify endpoint until the on-chain transfer is confirmed.
            const dataUrl = await QRCode.toDataURL(data.url, { width: 240, margin: 1 });
            setSolanaQr(dataUrl);
            const txId = data.transactionId;
            pollRef.current = setInterval(async () => {
                try {
                    const vr = await fetch('/api/payments/solana/verify', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ transactionId: txId }),
                    });
                    const vd = await vr.json();
                    if (vd.confirmed) {
                        if (pollRef.current) clearInterval(pollRef.current);
                        toast.success(t('toasts.paymentSuccess'));
                        router.push(planId ? '/dashboard/student/browse' : '/dashboard/student');
                    }
                } catch {
                    /* transient poll error — keep polling */
                }
            }, 3000);
            return true;
        }

        throw new Error('Unsupported checkout response');
    };

    const handleEnroll = async () => {
        setLoading(true);
        try {
            if (isFree) {
                await enrollFree(courseId);
                toast.success(t('toasts.success'));
                router.push('/dashboard/student');
                return;
            }

            if (paymentMethod === 'card') {
                // Lemon Squeezy / Solana go through the real provider checkout;
                // everything else uses the existing inline (mock) enrollment.
                if (isRedirectProvider || isQrProvider) {
                    const handled = await startProviderCheckout();
                    if (handled) return; // redirect leaves the page / QR keeps loading
                }
                await enrollUser(courseId, planId, 'mock_test');
                toast.success(t('toasts.paymentSuccess'));
                router.push(planId ? '/dashboard/student/browse' : '/dashboard/student');
            } else {
                // Offline payment — works for both products and plans
                if (productId) {
                    await createPaymentRequest({
                        productId,
                        contactName: offlineData.name,
                        contactEmail: offlineData.email,
                        contactPhone: offlineData.phone,
                        message: offlineData.message
                    });
                    toast.success(t('toasts.requestSent'));
                    router.push('/dashboard/student/payments');
                } else if (planId) {
                    await createPaymentRequest({
                        planId: parseInt(planId),
                        contactName: offlineData.name,
                        contactEmail: offlineData.email,
                        contactPhone: offlineData.phone,
                        message: offlineData.message
                    });
                    toast.success(t('toasts.requestSent'));
                    router.push('/dashboard/student/payments');
                } else {
                    throw new Error("No product or plan to process");
                }
            }
        } catch (error) {
            toast.error(t('toasts.error', { message: error instanceof Error ? error.message : String(error) }));
        } finally {
            setLoading(false);
        }
    };

    // ─── Order summary block (shared between free and paid) ───
    const orderSummary = (
        <div className="border-b border-border px-6 py-5 sm:px-8">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">{t('item')}</p>
                    <p className="mt-0.5 font-semibold">{title}</p>
                    {description && (
                        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground line-clamp-2">
                            {description}
                        </p>
                    )}
                    {durationDays && (
                        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <IconCalendar className="h-3.5 w-3.5" />
                            {t('duration', { days: durationDays })}
                        </p>
                    )}
                </div>
                <span className="shrink-0 text-2xl font-extrabold tabular-nums tracking-tight">
                    {isFree ? t('free') : displayPrice}
                </span>
            </div>

            {/* Features list */}
            {featureList.length > 0 && (
                <div className="mt-4 border-t border-border pt-4">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">{t('included')}</p>
                    <ul className="space-y-1.5">
                        {featureList.map((feature, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-foreground/80">
                                <IconCheck className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                                {feature}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );

    // ─── Free enrollment ───
    if (isFree) {
        return (
            <div className="rounded-xl border border-border bg-card">
                {orderSummary}

                <div className="px-6 py-4 sm:px-8">
                    <Button
                        className="w-full"
                        onClick={handleEnroll}
                        disabled={loading}
                    >
                        {loading && <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {loading ? t('enrollment.enrolling') : t('enrollment.button')}
                    </Button>
                </div>
            </div>
        );
    }

    // ─── Provider checkout (Lemon Squeezy redirect / Solana QR) ───
    if (isRedirectProvider || isQrProvider) {
        return (
            <div className="rounded-xl border border-border bg-card">
                {orderSummary}

                <div className="px-6 py-6 sm:px-8">
                    {solanaQr ? (
                        <div className="flex flex-col items-center gap-3 text-center">
                            <p className="text-sm font-medium">{t('payment.solanaScan')}</p>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={solanaQr}
                                alt="Solana Pay QR"
                                width={240}
                                height={240}
                                className="rounded-lg border border-border"
                            />
                            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
                                {t('payment.solanaWaiting')}
                            </p>
                        </div>
                    ) : (
                        <p className="rounded-lg bg-muted/50 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                            {isQrProvider ? t('payment.solanaInstructions') : t('payment.redirectInstructions')}
                        </p>
                    )}
                </div>

                {!solanaQr && (
                    <div className="border-t border-border px-6 py-4 sm:px-8">
                        <Button className="w-full" onClick={handleEnroll} disabled={loading}>
                            {loading && <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {loading ? t('payment.processing') : t('payment.button')}
                        </Button>
                        <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                            <IconLock className="h-3 w-3" />
                            {t('secureCheckout')}
                        </p>
                    </div>
                )}
            </div>
        );
    }

    // ─── Paid checkout ───
    return (
        <div className="rounded-xl border border-border bg-card">
            {orderSummary}

            {/* Payment methods */}
            <div className="px-6 py-6 sm:px-8">
                {showOfflineTab ? (
                    <Tabs defaultValue="card" onValueChange={(v) => v && setPaymentMethod(v as 'card' | 'offline')}>
                        <TabsList className="w-full">
                            <TabsTrigger value="card" className="flex-1 gap-1.5">
                                <IconCreditCard className="h-3.5 w-3.5" />
                                {t('payment.card')}
                            </TabsTrigger>
                            <TabsTrigger value="offline" className="flex-1 gap-1.5">
                                <IconBuildingBank className="h-3.5 w-3.5" />
                                {t('payment.offline')}
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="card" className="mt-5 space-y-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="cardholder" className="text-xs font-medium">{t('payment.cardholder')}</Label>
                                <Input id="cardholder" placeholder="John Doe" disabled={loading} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="cardNumber" className="text-xs font-medium">{t('payment.cardNumber')}</Label>
                                <div className="relative">
                                    <Input
                                        id="cardNumber"
                                        placeholder="4242 4242 4242 4242"
                                        className="pl-10"
                                        disabled={loading}
                                    />
                                    <IconCreditCard className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="expiry" className="text-xs font-medium">{t('payment.expiry')}</Label>
                                    <Input id="expiry" placeholder="MM/YY" disabled={loading} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="cvc" className="text-xs font-medium">{t('payment.cvc')}</Label>
                                    <Input id="cvc" placeholder="123" disabled={loading} />
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="offline" className="mt-5 space-y-4">
                            <p className="rounded-lg bg-muted/50 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                                {t('payment.offlineInstructions')}
                            </p>
                            <div className="space-y-1.5">
                                <Label htmlFor="offlineName" className="text-xs font-medium">{t('payment.contactName')}</Label>
                                <Input
                                    id="offlineName"
                                    placeholder="Your Name"
                                    value={offlineData.name}
                                    onChange={e => setOfflineData({ ...offlineData, name: e.target.value })}
                                    disabled={loading}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="offlineEmail" className="text-xs font-medium">{t('payment.contactEmail')}</Label>
                                <Input
                                    id="offlineEmail"
                                    type="email"
                                    placeholder="email@example.com"
                                    value={offlineData.email}
                                    onChange={e => setOfflineData({ ...offlineData, email: e.target.value })}
                                    disabled={loading}
                                    readOnly={!!userEmail}
                                    className={userEmail ? 'bg-muted' : ''}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="offlinePhone" className="text-xs font-medium">{t('payment.contactPhone')}</Label>
                                <Input
                                    id="offlinePhone"
                                    placeholder="+1 234 567 8900"
                                    value={offlineData.phone}
                                    onChange={e => setOfflineData({ ...offlineData, phone: e.target.value })}
                                    disabled={loading}
                                />
                            </div>
                        </TabsContent>
                    </Tabs>
                ) : (
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="cardholder" className="text-xs font-medium">{t('payment.cardholder')}</Label>
                            <Input id="cardholder" placeholder="John Doe" disabled={loading} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="cardNumber" className="text-xs font-medium">{t('payment.cardNumber')}</Label>
                            <div className="relative">
                                <Input
                                    id="cardNumber"
                                    placeholder="4242 4242 4242 4242"
                                    className="pl-10"
                                    disabled={loading}
                                />
                                <IconCreditCard className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="expiry" className="text-xs font-medium">{t('payment.expiry')}</Label>
                                <Input id="expiry" placeholder="MM/YY" disabled={loading} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="cvc" className="text-xs font-medium">{t('payment.cvc')}</Label>
                                <Input id="cvc" placeholder="123" disabled={loading} />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Submit */}
            <div className="border-t border-border px-6 py-4 sm:px-8">
                <Button
                    className="w-full"
                    onClick={handleEnroll}
                    disabled={loading}
                >
                    {loading && <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {loading
                        ? t('payment.processing')
                        : paymentMethod === 'card'
                            ? t('payment.button')
                            : t('payment.requestButton')
                    }
                </Button>
                <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                    <IconLock className="h-3 w-3" />
                    {t('secureCheckout')}
                </p>
            </div>
        </div>
    );
}
