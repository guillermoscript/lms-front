'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { enrollUser, enrollFree } from '@/app/[locale]/(public)/checkout/actions';
import { createPaymentRequest } from '@/app/actions/payment-requests';
import { useRouter } from 'next/navigation';
import { Loader2, CreditCard, Banknote, CheckCircle2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useTranslations } from 'next-intl';

interface CheckoutFormProps {
    courseId?: string;
    planId?: string;
    title: string;
    price: number | string;
    productId?: number;
}

export function CheckoutForm({ courseId, planId, title, price, productId }: CheckoutFormProps) {
    const [loading, setLoading] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState<'card' | 'offline'>('card');
    const [offlineData, setOfflineData] = useState({
        name: '',
        email: '',
        phone: '',
        message: ''
    });
    const router = useRouter();
    const t = useTranslations('checkout');

    const isFree = typeof price === 'number' ? price === 0 : price === t('free');

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
                // Offline payment request
                if (!productId) {
                    throw new Error("Product ID required for manual payment");
                }
                const result = await createPaymentRequest({
                    productId,
                    contactName: offlineData.name,
                    contactEmail: offlineData.email,
                    contactPhone: offlineData.phone,
                    message: offlineData.message
                });

                if (result.success) {
                    toast.success(t('toasts.requestSent'));
                    router.push('/dashboard/student');
                } else {
                    throw new Error(result.error || "Failed to create payment request");
                }
            }
        } catch (error) {
            toast.error(t('toasts.error', { message: error instanceof Error ? error.message : String(error) }));
        } finally {
            setLoading(false);
        }
    };

    if (isFree) {
        return (
            <Card className="w-full max-w-2xl mx-auto bg-zinc-900/40 backdrop-blur-xl border-zinc-800/80 rounded-[2.5rem] shadow-2xl overflow-hidden">
                <CardHeader className="p-10 text-center">
                    <CardTitle className="text-white text-3xl font-black tracking-tight">{t('enrollment.title')}</CardTitle>
                    <CardDescription className="text-zinc-500 font-medium">{t('enrollment.description')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 px-10">
                    <div className="p-8 bg-zinc-800/30 rounded-3xl border border-zinc-700/50 text-center shadow-inner">
                        <div className="flex justify-center mb-6">
                            <div className="bg-green-500/10 p-4 rounded-full border border-green-500/20">
                                <CheckCircle2 className="h-10 w-10 text-green-500" />
                            </div>
                        </div>
                        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">{t('item')}</div>
                        <div className="font-black text-white text-2xl tracking-tight mb-2">{title}</div>
                        <div className="text-3xl font-black text-green-400 mt-4 tracking-tighter uppercase">{t('free')}</div>
                    </div>
                </CardContent>
                <CardFooter className="p-10">
                    <Button
                        className="w-full bg-green-600 hover:bg-green-500 text-white font-black h-16 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-green-600/20 text-lg"
                        onClick={handleEnroll}
                        disabled={loading}
                    >
                        {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
                        {loading ? t('enrollment.enrolling') : t('enrollment.button')}
                    </Button>
                </CardFooter>
            </Card>
        );
    }

    return (
        <Card className="w-full max-w-2xl mx-auto bg-zinc-900/40 backdrop-blur-xl border-zinc-800/80 rounded-[2.5rem] shadow-2xl overflow-hidden">
            <CardContent className="space-y-8 p-10">
                <div className="p-6 bg-zinc-800/30 rounded-3xl border border-zinc-700/50 shadow-inner">
                    <div className="flex justify-between items-center">
                        <div>
                            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">{t('item')}</div>
                            <div className="font-black text-white text-xl tracking-tight">{title}</div>
                        </div>
                        <div className="text-3xl font-black text-white tracking-tighter">
                            {typeof price === 'number' ? `$${price}` : price}
                        </div>
                    </div>
                </div>

                <Tabs defaultValue="card" className="w-full" onValueChange={(v) => setPaymentMethod(v as any)}>
                    <TabsList className="grid grid-cols-2 w-full bg-zinc-800/50 p-1 rounded-2xl border border-zinc-700/50 h-14">
                        <TabsTrigger value="card" className="rounded-xl font-bold data-[state=active]:bg-zinc-700 data-[state=active]:text-white transition-all">
                            <CreditCard className="w-4 h-4 mr-2" />
                            {t('payment.card')}
                        </TabsTrigger>
                        <TabsTrigger value="offline" className="rounded-xl font-bold data-[state=active]:bg-zinc-700 data-[state=active]:text-white transition-all">
                            <Banknote className="w-4 h-4 mr-2" />
                            {t('payment.offline')}
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="card" className="space-y-5 mt-8 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="space-y-2">
                            <Label className="text-zinc-400 font-bold text-xs uppercase tracking-wider">{t('payment.cardholder')}</Label>
                            <Input placeholder="John Doe" className="bg-zinc-800/50 border-zinc-700/50 text-white rounded-xl h-12 px-4 focus:bg-zinc-800 transition-all font-medium" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-zinc-400 font-bold text-xs uppercase tracking-wider">{t('payment.cardNumber')}</Label>
                            <div className="relative group">
                                <Input placeholder="4242 4242 4242 4242" className="bg-zinc-800/50 border-zinc-700/50 text-white rounded-xl h-12 pl-12 focus:bg-zinc-800 transition-all font-medium" />
                                <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-500 group-focus-within:text-blue-400 transition-colors" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-zinc-400 font-bold text-xs uppercase tracking-wider">{t('payment.expiry')}</Label>
                                <Input placeholder="MM/YY" className="bg-zinc-800/50 border-zinc-700/50 text-white rounded-xl h-12 px-4 focus:bg-zinc-800 transition-all font-medium" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-zinc-400 font-bold text-xs uppercase tracking-wider">{t('payment.cvc')}</Label>
                                <Input placeholder="123" className="bg-zinc-800/50 border-zinc-700/50 text-white rounded-xl h-12 px-4 focus:bg-zinc-800 transition-all font-medium" />
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="offline" className="space-y-5 mt-8 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="bg-blue-500/5 border border-blue-500/20 p-4 rounded-xl text-xs text-blue-400/80 leading-relaxed font-medium">
                            {t('payment.offlineInstructions')}
                        </div>
                        <div className="space-y-2">
                            <Label className="text-zinc-400 font-bold text-xs uppercase tracking-wider">{t('payment.contactName')}</Label>
                            <Input
                                placeholder="Your Name"
                                className="bg-zinc-800/50 border-zinc-700/50 text-white rounded-xl h-12 px-4 focus:bg-zinc-800 transition-all font-medium"
                                value={offlineData.name}
                                onChange={e => setOfflineData({ ...offlineData, name: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-zinc-400 font-bold text-xs uppercase tracking-wider">{t('payment.contactEmail')}</Label>
                            <Input
                                type="email"
                                placeholder="email@example.com"
                                className="bg-zinc-800/50 border-zinc-700/50 text-white rounded-xl h-12 px-4 focus:bg-zinc-800 transition-all font-medium"
                                value={offlineData.email}
                                onChange={e => setOfflineData({ ...offlineData, email: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-zinc-400 font-bold text-xs uppercase tracking-wider">{t('payment.contactPhone')}</Label>
                            <Input
                                placeholder="+1 234 567 8900"
                                className="bg-zinc-800/50 border-zinc-700/50 text-white rounded-xl h-12 px-4 focus:bg-zinc-800 transition-all font-medium"
                                value={offlineData.phone}
                                onChange={e => setOfflineData({ ...offlineData, phone: e.target.value })}
                            />
                        </div>
                    </TabsContent>
                </Tabs>
            </CardContent>
            <CardFooter className="p-10 pt-0">
                <Button
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black h-16 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-blue-600/20 text-lg"
                    onClick={handleEnroll}
                    disabled={loading}
                >
                    {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
                    {loading ? t('payment.processing') : paymentMethod === 'card' ? t('payment.button') : t('payment.requestButton')}
                </Button>
            </CardFooter>
        </Card>
    );
}
