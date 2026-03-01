"use client";

import { useGamification, StoreItem } from "@/lib/hooks/use-gamification";
import { Button } from "@/components/ui/button";
import { IconCoin, IconLock, IconCheck, IconBolt } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useState } from "react";
import { useTranslations } from "next-intl";

interface PointStoreItemProps {
    item: StoreItem;
}

export function PointStoreItem({ item }: PointStoreItemProps) {
    const { summary, purchaseItem } = useGamification();
    const [isPurchasing, setIsPurchasing] = useState(false);
    const t = useTranslations('components.gamification');

    const canAfford = summary ? summary.coins >= item.price_coins : false;

    const handlePurchase = async () => {
        if (!canAfford || isPurchasing) return;

        setIsPurchasing(true);
        const result = await purchaseItem(item.id);
        setIsPurchasing(false);

        if (result.success) {
            toast.success(t('store.success'), {
                description: item.name,
                icon: <IconCheck className="text-green-500" />
            });
        } else {
            toast.error(t('store.error'), {
                description: result.error || ""
            });
        }
    };

    const categoryColors: Record<string, string> = {
        power_ups: "bg-amber-500/10 text-amber-500 border-amber-500/20",
        cosmetic: "bg-purple-500/10 text-purple-500 border-purple-500/20",
        badge: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20"
    };

    return (
        <div className="group bg-card border border-border rounded-2xl p-4 flex flex-col h-full shadow-sm hover:shadow-md transition-all duration-300">
            <div className="flex items-start justify-between mb-4">
                <div className={cn(
                    "p-2.5 rounded-xl border transition-transform group-hover:scale-110 duration-500",
                    categoryColors[item.category] || "bg-muted text-muted-foreground"
                )}>
                    {item.category === 'power_ups' ? <IconBolt size={24} /> : <span className="text-2xl">{item.icon}</span>}
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-muted/50 rounded-full border border-border/50">
                    <IconCoin size={14} className="text-cyan-500 fill-cyan-500/20" />
                    <span className="text-xs font-black">{item.price_coins}</span>
                </div>
            </div>

            <div className="flex-1 mb-6">
                <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-bold text-sm leading-tight truncate">
                        {item.name}
                    </h4>
                    {!canAfford && <IconLock size={12} className="text-muted-foreground" />}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {item.description}
                </p>
            </div>

            <Button
                onClick={handlePurchase}
                disabled={!canAfford || isPurchasing}
                variant={canAfford ? "default" : "secondary"}
                className={cn(
                    "w-full rounded-xl font-bold h-9 text-xs transition-all duration-300",
                    canAfford && "bg-cyan-500 hover:bg-cyan-600 text-white shadow-lg shadow-cyan-500/20"
                )}
            >
                {isPurchasing ? t('store.purchasing') : canAfford ? t('store.purchase') : t('store.notEnough')}
            </Button>
        </div>
    );
}
