"use client";

import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";

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
    freePlan: Plan;
}

export default function PricingClient({ monthlyPlans, yearlyPlans, freePlan }: PricingClientProps) {
    const [isYearly, setIsYearly] = useState(false);

    // Get the appropriate plans based on toggle
    const displayPlans = isYearly ? yearlyPlans : monthlyPlans;

    // Combine free plan with database plans
    const allPlans = [freePlan, ...displayPlans];

    // Determine which plan is most popular (middle one typically)
    const popularIndex = Math.floor(allPlans.length / 2);

    return (
        <>
            {/* Pricing Toggle */}
            {(monthlyPlans.length > 0 || yearlyPlans.length > 0) && (
                <div className="flex items-center justify-center space-x-4 mt-8 bg-zinc-900/50 p-1.5 rounded-full border border-zinc-800 w-fit mx-auto">
                    <span className={`text-sm font-medium px-3 cursor-pointer ${!isYearly ? "text-white" : "text-zinc-500"}`} onClick={() => setIsYearly(false)}>Monthly</span>
                    <Switch
                        checked={isYearly}
                        onCheckedChange={setIsYearly}
                        className="data-[state=checked]:bg-blue-600"
                    />
                    <span className={`text-sm font-medium px-3 cursor-pointer ${isYearly ? "text-white" : "text-zinc-500"}`} onClick={() => setIsYearly(true)}>
                        Yearly <span className="text-blue-400 text-xs ml-1 font-bold">Save 20%</span>
                    </span>
                </div>
            )}

            {/* Plans Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto relative z-10 mt-12">
                {allPlans.map((plan, index) => {
                    const isPopular = index === popularIndex;
                    
                    // Features should already be an array from server-side sanitization
                    const parsedFeatures: string[] = Array.isArray(plan.features) ? plan.features : [];

                    return (
                        <div key={plan.plan_id} className="relative group">
                            {isPopular && (
                                <div className="absolute -top-4 inset-x-0 flex justify-center z-10">
                                    <div className="bg-cyan-400 text-black text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">
                                        Most Popular
                                    </div>
                                </div>
                            )}

                            <Card className={`h-full flex flex-col bg-zinc-900/50 backdrop-blur-sm border transition-all duration-300 ${isPopular
                                    ? "border-cyan-500/50 shadow-lg shadow-cyan-500/10 scale-105 z-10"
                                    : "border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900"
                                }`}>
                                <CardHeader>
                                    <CardTitle className="text-xl font-bold text-white">{plan.plan_name}</CardTitle>
                                    <CardDescription className="text-zinc-400 h-10">{plan.description}</CardDescription>
                                </CardHeader>
                                <CardContent className="flex-1">
                                    <div className="mb-8">
                                        <div className="flex items-baseline">
                                            <span className="text-5xl font-bold text-white">
                                                ${plan.price}
                                            </span>
                                            <span className="text-zinc-400 ml-1">
                                                /{plan.duration_in_days === 30 ? 'mo' : plan.duration_in_days === 365 ? 'yr' : 'free'}
                                            </span>
                                        </div>
                                        {plan.plan_id === 0 ? (
                                            <Link href="/auth/sign-up">
                                                <Button className="w-full mt-6 bg-transparent border border-zinc-700 hover:bg-zinc-800 text-white">
                                                    Sign Up Free
                                                </Button>
                                            </Link>
                                        ) : (
                                            <Link href={`/checkout?planId=${plan.plan_id}`}>
                                                <Button className={`w-full mt-6 ${isPopular 
                                                    ? 'bg-cyan-400 hover:bg-cyan-300 text-black font-bold shadow-lg shadow-cyan-400/25'
                                                    : 'bg-transparent border border-zinc-700 hover:bg-zinc-800 text-white'
                                                }`}>
                                                    Get Started
                                                </Button>
                                            </Link>
                                        )}
                                    </div>
                                    <div className="space-y-4">
                                        {parsedFeatures?.map((feature: string, i: number) => {
                                            const isCrossed = feature === "Certificates" && plan.plan_id === 0;
                                            return (
                                                <li key={i} className="flex items-center text-zinc-300 list-none">
                                                    {isCrossed ? (
                                                        <X className="h-5 w-5 text-zinc-600 mr-3 flex-shrink-0" />
                                                    ) : (
                                                        <div className="h-5 w-5 bg-blue-500/20 rounded-full flex items-center justify-center mr-3 flex-shrink-0">
                                                            <Check className="h-3 w-3 text-blue-400" />
                                                        </div>
                                                    )}
                                                    <span className={isCrossed ? "text-zinc-600 line-through" : ""}>{feature}</span>
                                                </li>
                                            );
                                        })}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    );
                })}
            </div>
        </>
    );
}
