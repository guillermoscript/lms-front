"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";

export default function PricingPage() {
    const [isYearly, setIsYearly] = useState(false);

    // In a real app we might fetch these, but for the UI demo we'll use static data that matches the design
    const plans = [
        {
            id: "basic",
            name: "Basic",
            description: "Best for personal hobby projects.",
            price: 0,
            interval: "mo",
            features: [
                "Access to free courses",
                "Community support",
                "Certificates" // Crossed out
            ],
            popular: false
        },
        {
            id: "pro",
            name: "Pro",
            description: "For serious learners and pros.",
            price: isYearly ? 190 : 19,
            interval: isYearly ? "yr" : "mo",
            features: [
                "Access to all courses",
                "AI feedback on exams",
                "Certificates of completion",
                "Priority support"
            ],
            popular: true
        },
        {
            id: "enterprise",
            name: "Enterprise",
            description: "For large teams and organizations.",
            price: "Custom",
            interval: "",
            features: [
                "SSO & White-labeling",
                "Dedicated account manager",
                "API access",
                "Custom reporting"
            ],
            popular: false
        }
    ];

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

                    <div className="flex items-center space-x-4 mt-8 bg-zinc-900/50 p-1.5 rounded-full border border-zinc-800">
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
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto relative z-10">
                    {plans.map((plan) => (
                        <div key={plan.id} className="relative group">
                            {plan.popular && (
                                <div className="absolute -top-4 inset-x-0 flex justify-center z-10">
                                    <div className="bg-cyan-400 text-black text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">
                                        Most Popular
                                    </div>
                                </div>
                            )}

                            <Card className={`h-full flex flex-col bg-zinc-900/50 backdrop-blur-sm border transition-all duration-300 ${plan.popular
                                    ? "border-cyan-500/50 shadow-lg shadow-cyan-500/10 scale-105 z-10"
                                    : "border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900"
                                }`}>
                                <CardHeader>
                                    <CardTitle className="text-xl font-bold text-white">{plan.name}</CardTitle>
                                    <CardDescription className="text-zinc-400 h-10">{plan.description}</CardDescription>
                                </CardHeader>
                                <CardContent className="flex-1">
                                    <div className="mb-8">
                                        <div className="flex items-baseline">
                                            <span className="text-5xl font-bold text-white">
                                                {typeof plan.price === 'number' ? `$${plan.price}` : plan.price}
                                            </span>
                                            {plan.interval && (
                                                <span className="text-zinc-400 ml-1">/{plan.interval}</span>
                                            )}
                                        </div>
                                        {plan.id === "basic" && (
                                            <Link href="/register">
                                                <Button className="w-full mt-6 bg-transparent border border-zinc-700 hover:bg-zinc-800 text-white">
                                                    Sign Up Free
                                                </Button>
                                            </Link>
                                        )}
                                        {plan.id === "pro" && (
                                            <Link href={`/checkout?plan=pro&interval=${plan.interval}`}>
                                                <Button className="w-full mt-6 bg-cyan-400 hover:bg-cyan-300 text-black font-bold shadow-lg shadow-cyan-400/25">
                                                    Get Started
                                                </Button>
                                            </Link>
                                        )}
                                        {plan.id === "enterprise" && (
                                            <Link href="/contact">
                                                <Button className="w-full mt-6 bg-transparent border border-zinc-700 hover:bg-zinc-800 text-white">
                                                    Contact Sales
                                                </Button>
                                            </Link>
                                        )}
                                    </div>
                                    <div className="space-y-4">
                                        {plan.features.map((feature, i) => {
                                            const isCrossed = feature === "Certificates" && plan.id === "basic";
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
                    ))}
                </div>

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
                                <Check className="w-4 h-4 text-zinc-500 rotate-45" /> {/* Using Check as chevron for now or just generic icon */}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
