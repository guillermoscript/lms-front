"use client";

import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";
import { useTranslations } from 'next-intl';

interface Plan {
    plan_id: number;
    plan_name: string;
    price: number;
    duration_in_days: number;
    description: string;
    features: string | string[];
    payment_provider?: string;
}

interface PricingClientProps {
    monthlyPlans: Plan[];
    yearlyPlans: Plan[];
}

export default function PricingClient({ monthlyPlans, yearlyPlans }: PricingClientProps) {
    const [isYearly, setIsYearly] = useState(false);
    const t = useTranslations('pricing');

    // Get the appropriate plans based on toggle
    const displayPlans = isYearly ? yearlyPlans : monthlyPlans;

    const allPlans = displayPlans;

    // Determine which plan is most popular (middle one typically)
    const popularIndex = Math.floor(allPlans.length / 2);

    return (
        <>
            {/* Pricing Toggle */}
            {(monthlyPlans.length > 0 || yearlyPlans.length > 0) && (
                <div className="flex items-center justify-center space-x-6 mt-12 bg-zinc-900/80 p-1.5 rounded-2xl border border-zinc-800 w-fit mx-auto shadow-xl backdrop-blur-sm">
                    <span
                        className={`text-sm font-bold px-4 py-2 rounded-xl transition-all cursor-pointer ${!isYearly ? "text-white bg-zinc-800 shadow-lg" : "text-zinc-500 hover:text-zinc-400"}`}
                        onClick={() => setIsYearly(false)}
                    >
                        {t('monthly')}
                    </span>
                    <Switch
                        checked={isYearly}
                        onCheckedChange={setIsYearly}
                        className="data-[state=checked]:bg-blue-600"
                    />
                    <div className="flex items-center gap-2">
                        <span
                            className={`text-sm font-bold px-4 py-2 rounded-xl transition-all cursor-pointer ${isYearly ? "text-white bg-zinc-800 shadow-lg" : "text-zinc-500 hover:text-zinc-400"}`}
                            onClick={() => setIsYearly(true)}
                        >
                            {t('yearly')}
                        </span>
                        <span className="bg-blue-500/10 text-blue-400 text-[10px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider border border-blue-500/20">
                            {t('save', { percent: 20 })}
                        </span>
                    </div>
                </div>
            )}

            {/* Plans Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto relative z-10 mt-20">
                {allPlans.map((plan, index) => {
                    const isPopular = index === popularIndex;

                    // Features should already be an array from server-side sanitization
                    const parsedFeatures: string[] = Array.isArray(plan.features) ? plan.features : [];

                    return (
                        <div key={`${plan.plan_id}-${index}`} className="relative h-full">
                            {isPopular && (
                                <div className="absolute -top-4 inset-x-0 flex justify-center z-20">
                                    <div className="bg-blue-600 text-white text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-[0.1em] shadow-xl shadow-blue-600/20 border border-blue-500">
                                        {t('mostPopular')}
                                    </div>
                                </div>
                            )}

                            <Card className={`h-full flex flex-col bg-zinc-900/40 backdrop-blur-md border-[1.5px] transition-all duration-500 rounded-[2.5rem] group overflow-hidden ${isPopular
                                ? "border-blue-500/50 shadow-2xl shadow-blue-600/10 lg:scale-[1.05] z-10 bg-zinc-900/60"
                                : "border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900/60"
                                }`}>
                                <CardHeader className="p-8 pb-4">
                                    <div className="flex flex-col gap-1">
                                        <CardTitle className="text-2xl font-black text-white tracking-tight">{plan.plan_name}</CardTitle>
                                        <CardDescription className="text-zinc-500 text-sm font-medium h-12 leading-relaxed">{plan.description}</CardDescription>
                                    </div>
                                </CardHeader>
                                <CardContent className="flex-1 px-8 pb-10">
                                    <div className="mb-10">
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-6xl font-black text-white tracking-tighter">
                                                ${plan.price}
                                            </span>
                                            <span className="text-zinc-500 font-bold text-lg">
                                                /{plan.duration_in_days === 30 ? t('mo') : plan.duration_in_days === 365 ? t('yr') : t('free')}
                                            </span>
                                        </div>
                                        <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mt-2">
                                            {plan.duration_in_days === 365 ? t('billedYearly') : t('billedMonthly')}
                                        </div>

                                        <Link
                                            href={plan.payment_provider === 'manual'
                                                ? `/checkout/manual?planId=${plan.plan_id}`
                                                : `/checkout?planId=${plan.plan_id}`
                                            }
                                            className="block mt-10"
                                        >
                                            <Button className={`w-full h-14 rounded-2xl font-black transition-all hover:scale-[1.02] active:scale-[0.98] ${isPopular
                                                ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-xl shadow-blue-600/30 border-t border-blue-400'
                                                : 'bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700/50'
                                                }`}>
                                                {t('getStarted')}
                                            </Button>
                                        </Link>
                                    </div>
                                    <ul className="space-y-4 m-0 p-0">
                                        {parsedFeatures?.map((feature: string, i: number) => (
                                            <li key={i} className="flex items-center text-zinc-300 list-none group/item">
                                                <div className="h-6 w-6 bg-blue-500/10 rounded-full flex items-center justify-center mr-4 flex-shrink-0 border border-blue-500/20 group-hover/item:bg-blue-500/20 transition-colors">
                                                    <Check className="h-3.5 w-3.5 text-blue-400" />
                                                </div>
                                                <span className="text-sm font-medium leading-none text-zinc-300">
                                                    {feature}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </CardContent>
                            </Card>
                        </div>
                    );
                })}
            </div>
        </>
    );
}
