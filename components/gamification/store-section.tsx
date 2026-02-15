"use client";

import { useEffect } from "react";
import { useGamification } from "@/lib/hooks/use-gamification";
import { PointStoreItem } from "./point-store-item";
import { Skeleton } from "@/components/ui/skeleton";
import { IconShoppingBag, IconCoins } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

export function StoreSection() {
    const { storeItems, storeLoading, summary, refreshStore } = useGamification();
    const t = useTranslations('components.gamification');

    useEffect(() => {
        refreshStore();
    }, []);

    if (storeLoading && storeItems.length === 0) {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-48 rounded-2xl" />
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-500">
                        <IconShoppingBag size={24} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-foreground tracking-tight">{t('store.title')}</h2>
                        <p className="text-xs text-muted-foreground">{t('store.subtitle')}</p>
                    </div>
                </div>

                <div className="flex items-center gap-3 px-4 py-2 bg-card border border-border rounded-2xl shadow-sm">
                    <div className="flex flex-col items-end">
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest leading-none mb-1">{t('store.balance')}</span>
                        <span className="text-lg font-black leading-none">{summary?.coins || 0}</span>
                    </div>
                    <div className="p-1.5 rounded-lg bg-cyan-500 text-white shadow-lg shadow-cyan-500/20">
                        <IconCoins size={20} className="fill-white/20" />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {storeItems.map((item) => (
                    <PointStoreItem key={item.id} item={item} />
                ))}

                {storeItems.length === 0 && (
                    <div className="col-span-full py-12 text-center bg-muted/30 rounded-3xl border border-dashed border-border">
                        <p className="text-muted-foreground italic">{t('store.empty')}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
