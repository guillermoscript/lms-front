"use client";

import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { LayoutGrid } from "lucide-react";
import { useTranslations } from 'next-intl';

export function FilterSidebar() {
    const t = useTranslations('coursesCatalog.filterSidebar');
    const [priceRange, setPriceRange] = useState([0, 200]);

    const categories = [
        { id: "all", label: t('categoryList.all') },
        { id: "dev", label: t('categoryList.dev') },
        { id: "design", label: t('categoryList.design') },
        { id: "business", label: t('categoryList.business') },
        { id: "marketing", label: t('categoryList.marketing') },
    ];

    const levels = [
        { id: "beginner", label: t('levels.beginner') },
        { id: "intermediate", label: t('levels.intermediate') },
        { id: "advanced", label: t('levels.advanced') },
    ];

    return (
        <div className="space-y-8">
            {/* Categories */}
            <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t('categories')}</h3>
                <div className="space-y-2">
                    {categories.map((cat) => (
                        <div key={cat.id} className="flex items-center space-x-2 group cursor-pointer">
                            <LayoutGrid className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                            <span className={`text-sm ${cat.id === "dev" ? "text-foreground font-medium" : "text-muted-foreground group-hover:text-foreground"}`}>
                                {cat.label}
                            </span>
                            {cat.id === "dev" && (
                                <span className="ml-auto text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                                    {t('courseCount', { count: 124 })}
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <div className="h-px bg-border" />

            {/* Level */}
            <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t('level')}</h3>
                <div className="space-y-3">
                    {levels.map((level) => (
                        <div key={level.id} className="flex items-center space-x-2">
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${level.id === "intermediate" ? "border-primary" : "border-border"
                                }`}>
                                {level.id === "intermediate" && <div className="w-2 h-2 rounded-full bg-primary" />}
                            </div>
                            <span className="text-sm text-foreground">{level.label}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="h-px bg-border" />

            {/* Price Range */}
            <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t('priceRange')}</h3>
                <Slider
                    defaultValue={[0]}
                    max={200}
                    step={1}
                    className="w-full"
                // Customize slider colors via globals.css or class overrides if needed
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{t('priceMin')}</span>
                    <span>{t('priceMax')}</span>
                </div>
            </div>
        </div>
    );
}
