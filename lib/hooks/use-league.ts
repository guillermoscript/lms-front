"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface LeagueTier {
    tier: number;
    slug: string;
    name: string;
    max_tier: number;
}

export interface LeagueStanding {
    user_id: string;
    full_name: string | null;
    avatar_url: string | null;
    weekly_xp: number;
    rank: number;
    is_me: boolean;
}

export interface LeagueData {
    in_league: boolean;
    reason: "no_league" | "opted_out" | null;
    week_start?: string;
    week_end?: string;
    tier?: LeagueTier;
    promote_count?: number;
    demote_count?: number;
    cohort_size?: number;
    standings?: LeagueStanding[];
}

export function useLeague() {
    const [data, setData] = useState<LeagueData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const supabase = createClient();

    // RPC is not in the generated DB types yet — the browser client is
    // untyped, so we cast the JSONB payload to our interface.
    const fetchStandings = useCallback(async (): Promise<
        { data: LeagueData; error: null } | { data: null; error: Error }
    > => {
        const { data: standings, error: rpcError } = await supabase.rpc(
            "get_league_standings" as never
        );
        if (rpcError) {
            return { data: null, error: new Error(rpcError.message) };
        }
        return { data: standings as unknown as LeagueData, error: null };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const applyResult = useCallback(
        (result: Awaited<ReturnType<typeof fetchStandings>>) => {
            if (result.error) {
                console.error("League standings fetch failed:", result.error);
                setError(result.error);
            } else {
                setError(null);
                setData(result.data);
            }
            setIsLoading(false);
        },
        []
    );

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            const result = await fetchStandings();
            if (!cancelled) {
                applyResult(result);
            }
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [fetchStandings, applyResult]);

    const refetch = useCallback(async () => {
        applyResult(await fetchStandings());
    }, [fetchStandings, applyResult]);

    return { data, isLoading, error, refetch };
}

export function useLeagueOptOut() {
    const [optedOut, setOptedOut] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const supabase = createClient();

    useEffect(() => {
        const load = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;

                const { data } = await supabase
                    .from("gamification_profiles")
                    .select("leagues_opt_out")
                    .eq("user_id", user.id)
                    .maybeSingle();

                setOptedOut(Boolean((data as { leagues_opt_out?: boolean | null } | null)?.leagues_opt_out));
            } catch (err) {
                console.error("League opt-out fetch failed:", err);
            } finally {
                setIsLoading(false);
            }
        };
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const setOptOut = async (v: boolean) => {
        const { error } = await supabase.rpc("set_league_opt_out" as never, {
            _opt_out: v,
        } as never);
        if (error) {
            throw new Error(error.message);
        }
        setOptedOut(v);
    };

    return { optedOut, isLoading, setOptOut };
}
