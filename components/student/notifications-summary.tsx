"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    IconBell,
    IconMessageCircle,
    IconAlertCircle,
    IconInfoCircle,
    IconChevronRight
} from "@tabler/icons-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

interface NotificationsSummaryProps {
    notifications: any[];
}

export function NotificationsSummary({ notifications }: NotificationsSummaryProps) {
    const t = useTranslations('components.notifications');

    if (!notifications || notifications.length === 0) {
        return (
            <Card className="border-none shadow-soft h-full flex flex-col items-center justify-center p-8 text-center bg-muted/20">
                <div className="bg-background p-4 rounded-full mb-4 shadow-sm text-muted-foreground/30">
                    <IconBell size={40} />
                </div>
                <h3 className="font-bold text-lg">{t('empty.title')}</h3>
                <p className="text-sm text-muted-foreground">{t('empty.description')}</p>
            </Card>
        );
    }

    const getIcon = (type: string) => {
        switch (type) {
            case 'message': return <IconMessageCircle size={18} />;
            case 'alert': return <IconAlertCircle size={18} />;
            default: return <IconInfoCircle size={18} />;
        }
    };

    const getTypeStyles = (type: string) => {
        switch (type) {
            case 'message': return "bg-blue-500/10 text-blue-600";
            case 'alert': return "bg-red-500/10 text-red-600";
            default: return "bg-indigo-500/10 text-indigo-600";
        }
    };

    return (
        <Card className="border-none shadow-soft flex flex-col h-full overflow-hidden">
            <CardHeader className="bg-card pb-4 border-b border-muted/30">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary">
                            <IconBell size={18} />
                        </div>
                        <CardTitle className="text-xl font-black">{t('title')}</CardTitle>
                    </div>
                    {notifications.length > 5 && (
                        <Button variant="link" size="sm" className="text-primary font-bold">
                            {t('viewAll')}
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent className="p-0 overflow-y-auto max-h-[500px]">
                <div className="divide-y divide-muted/30">
                    {notifications.map((notif) => (
                        <Link
                            key={notif.notification_id}
                            href={notif.link || "#"}
                            className="flex gap-4 p-5 hover:bg-muted/30 transition-colors group"
                        >
                            <div className={cn(
                                "h-10 w-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
                                getTypeStyles(notif.notification_type)
                            )}>
                                {getIcon(notif.notification_type)}
                            </div>
                            <div className="flex-1 space-y-1">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                        {new Date(notif.created_at).toLocaleDateString()}
                                    </span>
                                    {!notif.read && (
                                        <div className="h-2 w-2 rounded-full bg-primary" />
                                    )}
                                </div>
                                <p className="text-sm font-bold text-foreground leading-snug group-hover:text-primary transition-colors">
                                    {notif.message}
                                </p>
                                {notif.shrot_message && (
                                    <p className="text-xs text-muted-foreground line-clamp-1">
                                        {notif.shrot_message}
                                    </p>
                                )}
                            </div>
                        </Link>
                    ))}
                </div>
            </CardContent>
            {notifications.length > 0 && (
                <div className="p-4 bg-muted/10 border-t border-muted/30">
                    <Button variant="outline" className="w-full rounded-xl gap-2 font-bold h-11">
                        {t('markAllAsRead')}
                    </Button>
                </div>
            )}
        </Card>
    );
}
