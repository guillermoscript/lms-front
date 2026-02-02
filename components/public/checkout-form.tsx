'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { enrollUser } from '@/app/(public)/checkout/actions';
import { useRouter } from 'next/navigation';
import { Loader2, CreditCard } from "lucide-react";

interface CheckoutFormProps {
    courseId?: string;
    planId?: string;
    title: string;
    price: number | string;
}

export function CheckoutForm({ courseId, planId, title, price }: CheckoutFormProps) {
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleEnroll = async () => {
        setLoading(true);
        try {
            await enrollUser(courseId, planId);
            router.push('/dashboard/student');
        } catch (error) {
            alert("Error enrolling: " + error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="w-full max-w-md mx-auto bg-zinc-900 border-zinc-800">
            <CardHeader>
                <CardTitle className="text-white">Checkout</CardTitle>
                <CardDescription className="text-zinc-400">Complete your purchase to start learning.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
                    <div className="text-sm text-zinc-400">Item</div>
                    <div className="font-semibold text-white text-lg">{title}</div>
                    <div className="text-xl font-bold text-white mt-1">
                        {typeof price === 'number' ? `$${price}` : price}
                    </div>
                </div>

                <div className="space-y-4">
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
                </div>
            </CardContent>
            <CardFooter>
                <Button
                    className="w-full bg-green-600 hover:bg-green-500 text-white"
                    onClick={handleEnroll}
                    disabled={loading}
                >
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {loading ? "Processing..." : "Pay & Enroll (Test)"}
                </Button>
            </CardFooter>
        </Card>
    );
}
