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

    const isFree = typeof price === 'number' ? price === 0 : price === 'Free';

    const handleEnroll = async () => {
        setLoading(true);
        try {
            if (isFree) {
                await enrollFree(courseId, planId);
                toast.success("Successfully enrolled!");
                router.push('/dashboard/student');
                return;
            }

            if (paymentMethod === 'card') {
                await enrollUser(courseId, planId, 'mock_test');
                toast.success("Payment successful! You are now enrolled.");
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
                    toast.success("Payment request sent! Check your email for instructions.");
                    router.push('/dashboard/student');
                } else {
                    throw new Error(result.error || "Failed to create payment request");
                }
            }
        } catch (error) {
            toast.error("Error: " + (error instanceof Error ? error.message : String(error)));
        } finally {
            setLoading(false);
        }
    };

    if (isFree) {
        return (
            <Card className="w-full max-w-md mx-auto bg-zinc-900 border-zinc-800">
                <CardHeader>
                    <CardTitle className="text-white">Complete Enrollment</CardTitle>
                    <CardDescription className="text-zinc-400">This course is free. Click below to start learning.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="p-6 bg-zinc-800/50 rounded-lg border border-zinc-700 text-center">
                        <div className="flex justify-center mb-4">
                            <CheckCircle2 className="h-12 w-12 text-green-500" />
                        </div>
                        <div className="text-sm text-zinc-400">Course</div>
                        <div className="font-semibold text-white text-xl">{title}</div>
                        <div className="text-2xl font-bold text-green-400 mt-2">FREE</div>
                    </div>
                </CardContent>
                <CardFooter>
                    <Button
                        className="w-full bg-green-600 hover:bg-green-500 text-white font-bold h-12"
                        onClick={handleEnroll}
                        disabled={loading}
                    >
                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {loading ? "Enrolling..." : "Enroll for Free"}
                    </Button>
                </CardFooter>
            </Card>
        );
    }

    return (
        <Card className="w-full max-w-md mx-auto bg-zinc-900 border-zinc-800">
            <CardHeader>
                <CardTitle className="text-white">Checkout</CardTitle>
                <CardDescription className="text-zinc-400">Choose your payment method to continue.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
                    <div className="flex justify-between items-center">
                        <div>
                            <div className="text-sm text-zinc-400">Item</div>
                            <div className="font-semibold text-white text-lg">{title}</div>
                        </div>
                        <div className="text-2xl font-bold text-white">
                            {typeof price === 'number' ? `$${price}` : price}
                        </div>
                    </div>
                </div>

                <Tabs defaultValue="card" onValueChange={(v) => setPaymentMethod(v as any)}>
                    <TabsList className="grid grid-cols-2 w-full bg-zinc-800 border-zinc-700">
                        <TabsTrigger value="card" className="data-[state=active]:bg-zinc-700">
                            <CreditCard className="w-4 h-4 mr-2" />
                            Card
                        </TabsTrigger>
                        <TabsTrigger value="offline" className="data-[state=active]:bg-zinc-700">
                            <Banknote className="w-4 h-4 mr-2" />
                            Offline
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="card" className="space-y-4 mt-4">
                        <div className="space-y-2">
                            <Label className="text-zinc-300">Cardholder Name</Label>
                            <Input placeholder="John Doe" className="bg-zinc-800 border-zinc-700 text-white" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-zinc-300">Card Number (Mock)</Label>
                            <div className="relative">
                                <Input placeholder="4242 4242 4242 4242" className="bg-zinc-800 border-zinc-700 text-white pl-10" />
                                <CreditCard className="absolute left-3 top-2.5 h-5 w-5 text-zinc-500" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Expiry</Label>
                                <Input placeholder="MM/YY" className="bg-zinc-800 border-zinc-700 text-white" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-zinc-300">CVC</Label>
                                <Input placeholder="123" className="bg-zinc-800 border-zinc-700 text-white" />
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="offline" className="space-y-4 mt-4">
                        <div className="bg-blue-500/10 border border-blue-500/20 p-3 rounded-md text-xs text-blue-400 mb-4">
                            Request payment instructions. We'll send you details for bank transfer or other offline methods.
                        </div>
                        <div className="space-y-2">
                            <Label className="text-zinc-300">Contact Name</Label>
                            <Input 
                                placeholder="Your Name" 
                                className="bg-zinc-800 border-zinc-700 text-white" 
                                value={offlineData.name}
                                onChange={e => setOfflineData({...offlineData, name: e.target.value})}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-zinc-300">Email for Instructions</Label>
                            <Input 
                                type="email" 
                                placeholder="email@example.com" 
                                className="bg-zinc-800 border-zinc-700 text-white" 
                                value={offlineData.email}
                                onChange={e => setOfflineData({...offlineData, email: e.target.value})}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-zinc-300">Phone (Optional)</Label>
                            <Input 
                                placeholder="+1 234 567 8900" 
                                className="bg-zinc-800 border-zinc-700 text-white" 
                                value={offlineData.phone}
                                onChange={e => setOfflineData({...offlineData, phone: e.target.value})}
                            />
                        </div>
                    </TabsContent>
                </Tabs>
            </CardContent>
            <CardFooter>
                <Button
                    className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold h-12"
                    onClick={handleEnroll}
                    disabled={loading}
                >
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {loading ? "Processing..." : paymentMethod === 'card' ? "Pay & Enroll (Test)" : "Request Payment Instructions"}
                </Button>
            </CardFooter>
        </Card>
    );
}
