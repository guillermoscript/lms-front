"use client";

import { useState } from "react";
import { useLeagueOptOut } from "@/lib/hooks/use-league";
import { Switch } from "@/components/ui/switch";
import { IconShield } from "@tabler/icons-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

export function LeagueOptOutToggle() {
    const { optedOut, isLoading, setOptOut } = useLeagueOptOut();
    const [isSaving, setIsSaving] = useState(false);
    const t = useTranslations("components.gamification.league.optOut");

    const handleChange = async (checked: boolean) => {
        setIsSaving(true);
        try {
            // Switch ON = participating in leagues = NOT opted out
            await setOptOut(!checked);
            toast.success(checked ? t("enabledToast") : t("disabledToast"));
        } catch {
            toast.error(t("error"));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
            <div className="flex items-start gap-3 min-w-0">
                <div className="p-1.5 rounded-lg bg-muted/50 shrink-0">
                    <IconShield size={18} className="text-muted-foreground" />
                </div>
                <div className="min-w-0">
                    <p className="text-sm font-semibold">{t("label")}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t("description")}</p>
                </div>
            </div>
            <Switch
                checked={!optedOut}
                onCheckedChange={handleChange}
                disabled={isLoading || isSaving}
                aria-label={t("label")}
            />
        </div>
    );
}
