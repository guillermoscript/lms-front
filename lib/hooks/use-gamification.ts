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

export interface LeaderboardEntry {
    rank: number;
    user_id: string;
    full_name: string | null;
    avatar_url: string | null;
    username: string | null;
    xp: number;
    level: number;
    current_streak: number;
}

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

export interface StoreItem {
    id: string;
    slug: string;
    name: string;
    description: string;
    price_coins: number;
    category: string;
    icon: string;
    metadata: any;
    is_available: boolean;
}

export function useGamification() {
    const [summary, setSummary] = useState<GamificationSummary | null>(null);
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const [allAchievements, setAllAchievements] = useState<Achievement[]>([]);
    const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [leaderboardLoading, setLeaderboardLoading] = useState(false);
    const [achievementsLoading, setAchievementsLoading] = useState(false);
    const [storeLoading, setStoreLoading] = useState(false);
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
                const errorData = await response.json().catch(() => ({}));
                console.error("Gamification summary error:", errorData);
                throw new Error(errorData.error || "Failed to fetch gamification summary");
            }

            const data = await response.json();
            setSummary(data);
        } catch (err: any) {
            setError(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchLeaderboard = async (timeframe: "weekly" | "monthly" | "all_time" = "weekly", limit = 5) => {
        try {
            setLeaderboardLoading(true);
            const { data: { session } } = await supabase.auth.getSession();

            if (!session) {
                setLeaderboardLoading(false);
                return;
            }

            const response = await fetch(
                `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/get-leaderboard?timeframe=${timeframe}&limit=${limit}`,
                {
                    headers: {
                        Authorization: `Bearer ${session.access_token}`,
                    },
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error("Leaderboard error:", errorData);
                throw new Error(errorData.error || "Failed to fetch leaderboard");
            }

            const data = await response.json();
            setLeaderboard(data);
        } catch (err: any) {
            console.error(err);
        } finally {
            setLeaderboardLoading(false);
        }
    };

    const fetchAllAchievements = async () => {
        try {
            setAchievementsLoading(true);
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

            setAllAchievements(combined);
        } catch (err: any) {
            console.error(err);
        } finally {
            setAchievementsLoading(false);
        }
    };

    const fetchStoreItems = async () => {
        try {
            setStoreLoading(true);
            const { data, error } = await supabase
                .from("gamification_store_items")
                .select("*")
                .eq("is_available", true);

            if (error) throw error;
            setStoreItems(data || []);
        } catch (err: any) {
            console.error(err);
        } finally {
            setStoreLoading(false);
        }
    };

    const purchaseItem = async (itemId: string) => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return { success: false, error: "Not authenticated" };

            const response = await fetch(
                `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/spend-points`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${session.access_token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ item_id: itemId }),
                }
            );

            const result = await response.json();
            if (response.ok) {
                fetchSummary();
                return { success: true, data: result };
            } else {
                return { success: false, error: result.error };
            }
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    };

    useEffect(() => {
        fetchSummary();
    }, []);

    return {
        summary,
        leaderboard,
        allAchievements,
        storeItems,
        loading,
        leaderboardLoading,
        achievementsLoading,
        storeLoading,
        error,
        refresh: fetchSummary,
        refreshLeaderboard: fetchLeaderboard,
        refreshAchievements: fetchAllAchievements,
        refreshStore: fetchStoreItems,
        purchaseItem
    };
}
