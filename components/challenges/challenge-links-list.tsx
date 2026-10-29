"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChallengeLinkAction } from "@/components/challenges/challenge-link-action";
import { Input } from "@/components/ui/input";
import {
  createChallengeLink,
  deactivateChallengeLink,
  listChallengeLinks,
  listUnsharedOfficialAttempts,
  type ChallengeLinkRow,
  type OfficialAttemptRow,
} from "@/app/actions/challenge-links";

export function ChallengeLinksList() {
  const t = useTranslations("challenges.admin.links");
  const [rows, setRows] = useState<ChallengeLinkRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [unshared, setUnshared] = useState<OfficialAttemptRow[]>([]);
  const [manualToken, setManualToken] = useState<string | null>(null);
  const tShare = useTranslations("challenges.share");

  const load = useCallback(async () => {
    setFailed(false);
    setRows(null);
    const [res, att] = await Promise.all([
      listChallengeLinks().catch(() => null),
      listUnsharedOfficialAttempts().catch(() => null),
    ]);
    if (res?.success) setRows(res.data);
    else setFailed(true);
    setUnshared(att?.success ? att.data : []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listChallengeLinks().then(
        (res) => (res.success ? res : null),
        () => null,
      ),
      listUnsharedOfficialAttempts().then(
        (res) => (res.success ? res.data : []),
        () => [] as OfficialAttemptRow[],
      ),
    ]).then(([res, att]) => {
      if (cancelled) return;
      if (res) setRows(res.data);
      else setFailed(true);
      setUnshared(att);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/reto/${token}`,
      );
      toast.success(t("copied"));
    } catch {
      // No clipboard on http origins: show the link to copy by hand.
      setManualToken(token);
    }
  }

  async function deactivate(id: string) {
    setBusyId(id);
    try {
      const res = await deactivateChallengeLink(id);
      if (res.success) {
        toast.success(t("deactivated"));
        setRows(
          (prev) =>
            prev?.map((r) => (r.id === id ? { ...r, active: false } : r)) ??
            prev,
        );
      } else {
        toast.error(t("error"));
      }
    } catch {
      toast.error(t("error"));
    } finally {
      setBusyId(null);
    }
  }

  if (failed) {
    return (
      <div className="space-y-2" role="alert">
        <p className="text-sm text-destructive">{t("loadError")}</p>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          {t("retry")}
        </Button>
      </div>
    );
  }
  if (rows === null) {
    return (
      <p
        className="flex items-center gap-2 text-sm text-muted-foreground"
        role="status"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {t("loading")}
      </p>
    );
  }
  const pending = unshared.length > 0 && (
    <section
      className="space-y-2"
      aria-labelledby="unshared-heading"
      data-testid="challenge-unshared"
    >
      <h2 id="unshared-heading" className="text-sm font-semibold">
        {tShare("pendingTitle")}
      </h2>
      <p className="text-sm text-muted-foreground">{tShare("pendingBody")}</p>
      <ul className="divide-y rounded-lg border">
        {unshared.map((a) => (
          <UnsharedRow
            key={a.attemptId}
            attempt={a}
            onCreated={() => void load()}
          />
        ))}
      </ul>
    </section>
  );

  if (rows.length === 0)
    return (
      <div className="space-y-6">
        {pending}
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      </div>
    );

  return (
    <div className="space-y-6">
      {pending}
      <ul
        className="divide-y rounded-lg border"
        data-testid="challenge-links-list"
      >
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-3 p-4"
          >
            <div className="min-w-0 space-y-0.5">
              <p className="truncate font-medium">
                {row.exerciseTitle || t("untitled")}
              </p>
              {row.active && (
                <p className="truncate font-mono text-xs text-muted-foreground">
                  /reto/{row.token}
                </p>
              )}
              {manualToken === row.token && (
                <Input
                  readOnly
                  autoFocus
                  aria-label={tShare("manualHint")}
                  value={`${window.location.origin}/reto/${row.token}`}
                  onFocus={(e) => e.currentTarget.select()}
                  className="font-mono text-xs"
                />
              )}
              <p className="text-sm text-muted-foreground">
                {row.score !== null && (
                  <>{t("score", { score: row.score })} · </>
                )}
                {row.active ? t("active") : t("inactive")} ·{" "}
                {new Date(row.createdAt).toLocaleDateString()}
              </p>
            </div>
            {row.active && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void copy(row.token)}
                >
                  {t("copy")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busyId === row.id}
                  onClick={() => void deactivate(row.id)}
                >
                  {busyId === row.id && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {t("deactivate")}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function UnsharedRow({
  attempt,
  onCreated,
}: {
  attempt: OfficialAttemptRow;
  onCreated: () => void;
}) {
  const t = useTranslations("challenges.admin.links");
  const tShare = useTranslations("challenges.share");
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0 space-y-0.5">
        <p className="truncate font-medium">
          {attempt.exerciseTitle || t("untitled")}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("score", { score: attempt.score })}
        </p>
      </div>
      <ChallengeLinkAction
        size="sm"
        variant="outline"
        label={tShare("createLink")}
        testId={`challenge-create-link-${attempt.attemptId}`}
        create={async () => {
          const r = await createChallengeLink(attempt.attemptId);
          return r.success
            ? {
                success: true,
                data: { ...r.data, reused: false, score: attempt.score },
              }
            : r;
        }}
        onCreated={onCreated}
      />
    </li>
  );
}
