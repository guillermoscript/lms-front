'use client';

import { useState } from 'react';
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

    const isFree = typeof price === 'number' ? price === 0 : price === t('free');
    const displayPrice = formattedPrice || (typeof price === 'number' ? `$${price}` : price);

    // Parse features string into list (features are stored as newline or comma-separated text)
    const featureList = features
        ? features.split(/[\n,]+/).map(f => f.trim()).filter(Boolean)
        : [];

    const handleEnroll = async () => {
        setLoading(true);
        try {
            if (isFree) {
                await enrollFree(courseId, planId);
                toast.success(t('toasts.success'));
                router.push('/dashboard/student');
                return;
            }

            if (paymentMethod === 'card') {
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

    // ─── Paid checkout ───
    return (
        <div className="rounded-xl border border-border bg-card">
            {orderSummary}

            {/* Payment methods */}
            <div className="px-6 py-6 sm:px-8">
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
