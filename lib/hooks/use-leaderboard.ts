"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

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

export function useLeaderboard() {
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const supabase = createClient();

    const fetchLeaderboard = async (timeframe: "weekly" | "monthly" | "all_time" = "weekly", limit = 5) => {
        try {
            setLoading(true);
            const { data: { session } } = await supabase.auth.getSession();

            if (!session) {
                setLoading(false);
                return;
            }

            const response = await globalThis.fetch(
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
            setLoading(false);
        }
    };

    return { leaderboard, loading, fetch: fetchLeaderboard };
}
