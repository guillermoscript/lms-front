"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/database.types";
import { useTenant } from "@/components/tenant/tenant-provider";

export interface StoreItem {
    id: string;
    slug: string;
    name: string;
    description: string;
    price_coins: number;
    category: string;
    icon: string;
    metadata: Json;
    is_available: boolean;
}

export function usePointStore(options?: { onPurchase?: () => void }) {
    const [items, setItems] = useState<StoreItem[]>([]);
    const [loading, setLoading] = useState(false);
    const supabase = createClient();
    const tenantId = useTenant()?.id;

    const fetchItems = async () => {
        try {
            setLoading(true);
            // Global items (tenant_id NULL) plus this school's own.
            let query = supabase
                .from("gamification_store_items")
                .select("*")
                .eq("is_available", true);
            query = tenantId
                ? query.or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
                : query.is("tenant_id", null);
            const { data, error } = await query;

            if (error) throw error;
            setItems(data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const purchase = async (itemId: string) => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return { success: false, error: "Not authenticated" };

            const response = await globalThis.fetch(
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
                options?.onPurchase?.();
                return { success: true, data: result };
            } else {
                return { success: false, error: result.error };
            }
        } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    };

    return { items, loading, fetch: fetchItems, purchase };
}
