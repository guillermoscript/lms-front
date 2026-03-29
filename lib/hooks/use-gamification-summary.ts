"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface GamificationFeatures {
    xp: boolean;
    levels: boolean;
    streaks: boolean;
    leaderboard: boolean;
    achievements: boolean;
    store: boolean;
    custom_achievements: boolean;
    custom_store: boolean;
}

export interface GamificationSummary {
    total_xp: number;
    level: number;
    level_title: string;
    level_icon: string | null;
    xp_progress: {
        current: number;
        required: number;
        percentage: number;
    };
    streak: {
        current: number;
        longest: number;
        freezes_available: number;
        last_activity: string | null;
    };
    coins: number;
    achievements: {
        earned: number;
        total: number;
        recent: any[];
        newly_earned: string[];
    };
    recent_xp: any[];
    features: GamificationFeatures;
}

export function useGamificationSummary() {
    const [summary, setSummary] = useState<GamificationSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const supabase = createClient();

    const fetchSummary = async () => {
        try {
            setLoading(true);
            const { data: { session } } = await supabase.auth.getSession();

            if (!session) {
                setLoading(false);
                return;
            }

            const response = await fetch(
                `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/get-gamification-summary`,
                {
                    headers: {
                        Authorization: `Bearer ${session.access_token}`,
                    },
                }
            );

            if (!response.ok) {
                // Edge function unavailable or user has no gamification profile in this tenant — use defaults
                console.warn("Gamification summary unavailable (status %d), using defaults", response.status);
                setSummary(null);
                return;
            }

            const data = await response.json();
            setSummary(data);
        } catch (err: any) {
            // Network error or edge function not deployed — silently degrade
            console.warn("Gamification fetch failed, using defaults:", err.message);
            setSummary(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSummary();
    }, []);

    return { summary, loading, error, refresh: fetchSummary };
}
