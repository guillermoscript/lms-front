"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface Achievement {
    id: string;
    slug: string;
    title: string;
    description: string;
    tier: "bronze" | "silver" | "gold" | "platinum";
    category: string;
    icon: string;
    xp_reward: number;
    earned_at?: string;
}

export function useAchievements() {
    const [achievements, setAchievements] = useState<Achievement[]>([]);
    const [loading, setLoading] = useState(false);
    const supabase = createClient();

    const fetchAchievements = async () => {
        try {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Fetch all achievements and user's earned achievements
            const [achievementsRes, userAchievementsRes] = await Promise.all([
                supabase.from("gamification_achievements").select("*").order("tier", { ascending: true }),
                supabase.from("gamification_user_achievements").select("*").eq("user_id", user.id)
            ]);

            if (achievementsRes.error) throw achievementsRes.error;

            const earnedMap = new Map(
                (userAchievementsRes.data || []).map(ua => [ua.achievement_id, ua.earned_at])
            );

            const combined: Achievement[] = (achievementsRes.data || []).map(a => ({
                ...a,
                earned_at: earnedMap.get(a.id)
            }));

            setAchievements(combined);
        } catch (err: any) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return { achievements, loading, fetch: fetchAchievements };
}
