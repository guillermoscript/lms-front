import { createClient } from "@/lib/supabase/server";
import { Check } from "lucide-react";
import PricingClient from "./pricing-client";

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
    
    // Fetch plans from database
    const { data: plans, error } = await supabase
        .from('plans')
        .select('*')
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

    // Hardcoded free plan (not in database)
    const freePlan = {
        plan_id: 0,
        plan_name: "Basic",
        price: 0,
        duration_in_days: 0,
        description: "Best for personal hobby projects.",
        features: [
            "Access to free courses",
            "Community support",
            "Certificates" // Will be crossed out
        ]
    };

    return (
        <div className="min-h-screen bg-[#09090b] text-white font-sans">
            {/* Header */}
            <div className="container py-24 px-4 md:px-6 relative">
                {/* Background Glow */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-blue-500/20 blur-[100px] rounded-full pointer-events-none" />

                <div className="flex flex-col items-center space-y-4 text-center mb-16 relative z-10">
                    <h1 className="text-4xl font-bold tracking-tight sm:text-6xl text-white">
                        Choose Your Learning Path
                    </h1>
                    <p className="max-w-[700px] text-zinc-400 md:text-xl">
                        Unlock your potential with our flexible pricing plans designed for learners of all levels. Upgrade anytime as your skills grow.
                    </p>
                </div>

                {sanitizedPlans.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-zinc-400">No plans available at the moment.</p>
                    </div>
                ) : (
                    <PricingClient 
                        monthlyPlans={monthlyPlans} 
                        yearlyPlans={yearlyPlans} 
                        freePlan={freePlan}
                    />
                )}

                {/* FAQ or Footer Section */}
                <div className="max-w-3xl mx-auto mt-32">
                    <h2 className="text-2xl font-bold text-center mb-8">Frequently Asked Questions</h2>
                    <div className="space-y-4">
                        {[
                            "Can I change plans later?",
                            "Do you offer discounts for students?",
                            "What payment methods do you accept?"
                        ].map((q, i) => (
                            <div key={i} className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 flex justify-between items-center cursor-pointer hover:bg-zinc-900 transition-colors">
                                <span className="font-medium text-zinc-200">{q}</span>
                                <Check className="w-4 h-4 text-zinc-500 rotate-45" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
