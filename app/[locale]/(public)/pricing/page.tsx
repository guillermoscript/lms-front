import { createClient } from "@/lib/supabase/server";
import { HelpCircle, PackageSearch, ArrowRight } from "lucide-react";
import PricingClient from "./pricing-client";
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

interface Plan {
    plan_id: number;
    plan_name: string;
    price: number;
    duration_in_days: number;
    description: string;
    features: string | string[];
    payment_provider?: string;
}

export default async function PricingPage() {
    const supabase = await createClient();
    const t = await getTranslations('pricing');

    // Fetch plans from database
    const { data: plans, error } = await supabase
        .from('plans')
        .select('plan_id, plan_name, price, duration_in_days, description, features, payment_provider')
        .order('price', { ascending: true });

    if (error) {
        console.error('Error fetching plans:', error);
    }

    // Sanitize features field - ensure it's always valid
    const sanitizedPlans = plans?.map(plan => {
        let features: string[] = [];

        if (typeof plan.features === 'string' && plan.features.trim()) {
            try {
                const trimmed = plan.features.trim();
                if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
                    const parsed = JSON.parse(trimmed);
                    features = Array.isArray(parsed) ? parsed : [];
                }
            } catch (error) {
                console.error(`Failed to parse features for plan "${plan.plan_name}":`, plan.features, error);
                features = [];
            }
        } else if (Array.isArray(plan.features)) {
            features = plan.features;
        }

        return {
            ...plan,
            features
        };
    }) || [];

    // Group plans by duration
    const monthlyPlans = sanitizedPlans.filter(p => p.duration_in_days === 30);
    const yearlyPlans = sanitizedPlans.filter(p => p.duration_in_days === 365);

    return (
        <div className="min-h-screen bg-[#09090b] text-white font-sans">
            <div className="container py-24 px-4 md:px-6 relative">
                {/* Background Glow */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[800px] h-[500px] bg-blue-500/10 blur-[120px] rounded-full pointer-events-none -z-10" />

                {/* Header */}
                <div className="flex flex-col items-center space-y-6 text-center mb-20 relative z-10">
                    <h1 className="text-5xl lg:text-7xl font-bold tracking-tight text-white leading-tight">
                        {t('title')}
                    </h1>
                    <p className="max-w-[750px] text-zinc-400 text-lg md:text-xl leading-relaxed">
                        {t('description')}
                    </p>
                </div>

                {sanitizedPlans.length === 0 ? (
                    <div className="relative max-w-2xl mx-auto px-6 py-16 text-center bg-zinc-900/40 border border-zinc-800 rounded-[2rem] backdrop-blur-sm overflow-hidden group">
                        <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/15 transition-colors" />
                        <div className="relative z-10 flex flex-col items-center gap-6">
                            <div className="w-16 h-16 bg-zinc-800/50 rounded-2xl flex items-center justify-center border border-zinc-700/50 shadow-xl">
                                <PackageSearch className="w-8 h-8 text-blue-400" />
                            </div>
                            <div className="space-y-3">
                                <h3 className="text-2xl font-bold text-white">{t('empty.title')}</h3>
                                <p className="text-zinc-500 max-w-sm mx-auto leading-relaxed">
                                    {t('empty.description')}
                                </p>
                            </div>
                            <div className="pt-4">
                                <Link href="/courses">
                                    <Button className="bg-blue-600 hover:bg-blue-500 text-white px-8 rounded-xl h-12 font-semibold transition-all hover:scale-105 active:scale-95 shadow-lg shadow-blue-600/20">
                                        {t('empty.backToCourses')}
                                        <ArrowRight className="ml-2 w-4 h-4" />
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </div>
                ) : (
                    <PricingClient
                        monthlyPlans={monthlyPlans}
                        yearlyPlans={yearlyPlans}
                    />
                )}

                {/* FAQ Section */}
                <div className="max-w-4xl mx-auto mt-40">
                    <div className="flex flex-col items-center gap-4 mb-12">
                        <div className="bg-zinc-900/80 border border-zinc-800 px-4 py-1.5 rounded-full flex items-center gap-2 text-zinc-400 text-sm font-medium">
                            <HelpCircle className="w-4 h-4 text-blue-400" />
                            {t('faq.title')}
                        </div>
                        <h2 className="text-3xl md:text-4xl font-bold text-center text-white">{t('faq.title')}</h2>
                    </div>

                    <div className="grid md:grid-cols-1 gap-4">
                        {Object.entries(t.raw('faq.questions')).map(([key, question]) => (
                            <div key={key} className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-6 flex justify-between items-center group cursor-default hover:bg-zinc-900/50 hover:border-zinc-700 transition-all duration-300">
                                <div className="space-y-1">
                                    <p className="font-bold text-zinc-200 text-lg">{question as string}</p>
                                </div>
                                <div className="h-8 w-8 rounded-full border border-zinc-700 flex items-center justify-center text-zinc-500 group-hover:border-zinc-500 group-hover:text-zinc-300 transition-colors">
                                    <ArrowRight className="w-4 h-4" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
