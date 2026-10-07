"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconShoppingBag, IconCoins, IconLock } from "@tabler/icons-react";
import { useGamificationSummary } from "@/lib/hooks/use-gamification-summary";
import { usePointStore } from "@/lib/hooks/use-point-store";
import { PointStoreItem } from "@/components/gamification/point-store-item";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ListToolbar, matchesQuery } from "@/components/student/list-toolbar";
import { FEATURE_REQUIRED_PLAN } from "@/lib/plans/features";

type Affordability = "all" | "affordable";
type Sort = "default" | "priceAsc" | "priceDesc" | "name";

/** Point store with search / category + affordable filter / sort. Data comes from the same hooks as the old StoreSection. */
export function StoreExplorer() {
    const { summary, refresh } = useGamificationSummary();
    const { items: storeItems, loading: storeLoading, fetch: fetchStore } = usePointStore({ onPurchase: refresh });
    const t = useTranslations("components.gamification");
    const tPlans = useTranslations("billing.plans");
    const locale = useLocale();

    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("all");
    const [afford, setAfford] = useState<Affordability>("all");
    const [sort, setSort] = useState<Sort>("default");

    useEffect(() => {
        if (summary?.features?.store) {
            fetchStore();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [summary?.features?.store]);

    const coins = summary?.coins || 0;

    const categories = useMemo(
        () => Array.from(new Set(storeItems.map((i) => i.category).filter(Boolean))).sort((a, b) => a.localeCompare(b, locale)),
        [storeItems, locale]
    );

    const visible = useMemo(() => {
        return storeItems
            .filter(
                (i) =>
                    matchesQuery(search, locale, i.name, i.description) &&
                    (category === "all" || i.category === category) &&
                    (afford === "all" || i.price_coins <= coins)
            )
            .sort((a, b) => {
                if (sort === "priceAsc") return a.price_coins - b.price_coins;
                if (sort === "priceDesc") return b.price_coins - a.price_coins;
                if (sort === "name") return a.name.localeCompare(b.name, locale);
                return 0;
            });
    }, [storeItems, search, category, afford, sort, coins, locale]);

    const filtered = search !== "" || category !== "all" || afford !== "all";

    function reset() {
        setSearch("");
        setCategory("all");
        setAfford("all");
    }

    if (summary && !summary.features?.store) {
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-brand-tint text-brand-text">
                        <IconShoppingBag size={24} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-foreground tracking-tight">{t("store.title")}</h2>
                        <p className="text-xs text-muted-foreground">{t("store.subtitle")}</p>
                    </div>
                </div>
                <div className="py-12 text-center bg-muted/30 rounded-3xl border border-dashed border-border">
                    <div className="mx-auto w-12 h-12 rounded-2xl bg-muted/50 flex items-center justify-center mb-3">
                        <IconLock size={24} className="text-muted-foreground" />
                    </div>
                    <p className="text-sm font-bold">{t("upgrade.storeLocked", { plan: tPlans(FEATURE_REQUIRED_PLAN.store) })}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t("upgrade.upgradeDescription")}</p>
                </div>
            </div>
        );
    }

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
                    <div className="p-2 rounded-xl bg-brand-tint text-brand-text">
                        <IconShoppingBag size={24} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-foreground tracking-tight">{t("store.title")}</h2>
                        <p className="text-xs text-muted-foreground">{t("store.subtitle")}</p>
                    </div>
                </div>

                <div className="flex items-center gap-3 px-4 py-2 bg-card border border-border rounded-2xl shadow-sm">
                    <div className="flex flex-col items-end">
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest leading-none mb-1">{t("store.balance")}</span>
                        <span className="text-lg font-black leading-none">{coins}</span>
                    </div>
                    <div className="p-1.5 rounded-lg bg-primary text-primary-foreground shadow-lg">
                        <IconCoins size={20} className="fill-primary-foreground/20" />
                    </div>
                </div>
            </div>

            {storeItems.length > 0 && (
                <ListToolbar
                    search={search}
                    onSearchChange={setSearch}
                    searchLabel={t("store.list.search")}
                    searchPlaceholder={t("store.list.searchPlaceholder")}
                    selects={[
                        {
                            id: "category",
                            label: t("store.list.category"),
                            value: category,
                            options: [
                                { value: "all", label: t("store.list.allCategories") },
                                ...categories.map((c) => ({ value: c, label: c.replace(/_/g, ' ').replace(/^\w/, (m) => m.toUpperCase()) })),
                            ],
                            onChange: setCategory,
                        },
                        {
                            id: "afford",
                            label: t("store.list.availability"),
                            value: afford,
                            options: [
                                { value: "all", label: t("store.list.all") },
                                { value: "affordable", label: t("store.list.affordable") },
                            ],
                            onChange: (v) => setAfford(v === "affordable" ? "affordable" : "all"),
                        },
                        {
                            id: "sort",
                            label: t("store.list.sort"),
                            value: sort,
                            options: [
                                { value: "default", label: t("store.list.sortDefault") },
                                { value: "priceAsc", label: t("store.list.priceAsc") },
                                { value: "priceDesc", label: t("store.list.priceDesc") },
                                { value: "name", label: t("store.list.name") },
                            ],
                            onChange: (v) => setSort((["default", "priceAsc", "priceDesc", "name"].includes(v) ? v : "default") as Sort),
                        },
                    ]}
                    resultsText={t("store.list.results", { count: visible.length, total: storeItems.length })}
                    showReset={filtered}
                    onReset={reset}
                    resetLabel={t("store.list.reset")}
                />
            )}

            {storeItems.length === 0 ? (
                <div className="py-12 text-center bg-muted/30 rounded-3xl border border-dashed border-border">
                    <p className="text-muted-foreground italic">{t("store.empty")}</p>
                </div>
            ) : visible.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
                    <p className="font-medium">{t("store.list.noMatches")}</p>
                    <p className="text-sm text-muted-foreground">{t("store.list.noMatchesHint")}</p>
                    <Button variant="outline" size="sm" onClick={reset}>
                        {t("store.list.reset")}
                    </Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {visible.map((item) => (
                        <PointStoreItem key={item.id} item={item} onPurchaseComplete={refresh} />
                    ))}
                </div>
            )}
        </div>
    );
}
