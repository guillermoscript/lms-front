"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconAlertTriangle, IconLoader2, IconTrash } from "@tabler/icons-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { AccountDeletionBlocker } from "@/lib/account/delete-account";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Status =
    | { kind: "loading" }
    | { kind: "ready"; phrase: string }
    | { kind: "blocked"; blockers: AccountDeletionBlocker[] }
    | { kind: "error" };

/**
 * "Delete account" (#850) — the in-app deletion Google Play and the App Store
 * require. Opening the dialog asks the server what stands in the way; the
 * delete itself needs the account's email typed back.
 */
export function DeleteAccountCard() {
    const t = useTranslations("components.deleteAccount");
    const locale = useLocale();
    const [open, setOpen] = useState(false);
    const [status, setStatus] = useState<Status>({ kind: "loading" });
    const [typed, setTyped] = useState("");
    const [deleting, setDeleting] = useState(false);

    async function load() {
        setStatus({ kind: "loading" });
        setTyped("");
        try {
            const res = await fetch("/api/account/delete");
            if (!res.ok) throw new Error(String(res.status));
            const body = (await res.json()) as { blockers: AccountDeletionBlocker[]; confirmationPhrase: string };
            setStatus(
                body.blockers.length > 0
                    ? { kind: "blocked", blockers: body.blockers }
                    : { kind: "ready", phrase: body.confirmationPhrase },
            );
        } catch {
            setStatus({ kind: "error" });
        }
    }

    async function handleDelete() {
        setDeleting(true);
        try {
            const res = await fetch("/api/account/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ confirm: typed }),
            });
            const body = await res.json().catch(() => ({}));
            if (res.status === 409) {
                setStatus({ kind: "blocked", blockers: body.blockers ?? [] });
                return;
            }
            if (!res.ok) {
                toast.error(res.status === 400 ? t("mismatch") : t("error"));
                return;
            }
            // The account is gone; drop the now-dead session from this browser.
            await createClient().auth.signOut({ scope: "local" }).catch(() => {});
            window.location.assign(`/${locale}/delete-account?deleted=1`);
        } catch {
            toast.error(t("error"));
        } finally {
            setDeleting(false);
        }
    }

    const phraseMatches =
        status.kind === "ready" && typed.trim().toLowerCase() === status.phrase.toLowerCase();

    return (
        <Card className="border border-destructive/40">
            <CardHeader>
                <CardTitle className="text-sm">{t("title")}</CardTitle>
                <CardDescription>{t("description")}</CardDescription>
            </CardHeader>
            <CardContent>
                <AlertDialog
                    open={open}
                    onOpenChange={(next) => {
                        setOpen(next);
                        if (next) void load();
                    }}
                >
                    <AlertDialogTrigger render={<Button variant="destructive" />}>
                        <IconTrash size={16} aria-hidden />
                        {t("button")}
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>{t("dialogTitle")}</AlertDialogTitle>
                            <AlertDialogDescription>{t("dialogDescription")}</AlertDialogDescription>
                        </AlertDialogHeader>

                        {status.kind === "loading" && (
                            <div className="flex justify-center py-4" role="status" aria-label={t("loading")}>
                                <IconLoader2 className="animate-spin text-muted-foreground" size={20} />
                            </div>
                        )}

                        {status.kind === "error" && (
                            <p className="text-sm text-destructive" role="alert">{t("loadError")}</p>
                        )}

                        {status.kind === "blocked" && (
                            <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3 text-sm" role="alert">
                                <p className="flex items-center gap-2 font-medium">
                                    <IconAlertTriangle size={16} className="text-destructive" aria-hidden />
                                    {t("blockedTitle")}
                                </p>
                                <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                                    {status.blockers.map((b, i) => (
                                        <li key={i}>
                                            {b.reason === "sole_admin"
                                                ? t("blockers.soleAdmin", { school: b.school })
                                                : b.reason === "live_subscription"
                                                  ? t("blockers.liveSubscription", { plan: b.plan ?? "" })
                                                  : t("blockers.superAdmin")}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {status.kind === "ready" && (
                            <div className="space-y-2">
                                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                                    <li>{t("consequences.removed")}</li>
                                    <li>{t("consequences.kept")}</li>
                                    <li>{t("consequences.final")}</li>
                                </ul>
                                <Label htmlFor="delete-account-confirm" className="pt-2">
                                    {t("confirmLabel", { phrase: status.phrase })}
                                </Label>
                                <Input
                                    id="delete-account-confirm"
                                    value={typed}
                                    onChange={(e) => setTyped(e.target.value)}
                                    autoComplete="off"
                                    spellCheck={false}
                                    placeholder={status.phrase}
                                />
                            </div>
                        )}

                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={deleting}>{t("cancel")}</AlertDialogCancel>
                            {status.kind === "ready" && (
                                <Button
                                    variant="destructive"
                                    disabled={!phraseMatches || deleting}
                                    onClick={handleDelete}
                                >
                                    {deleting && <IconLoader2 className="animate-spin" size={16} aria-hidden />}
                                    {t("confirm")}
                                </Button>
                            )}
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </CardContent>
        </Card>
    );
}
