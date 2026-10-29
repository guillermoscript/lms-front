"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import {
  IconCheck,
  IconLink,
  IconLoader2,
  IconShare3,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  ChallengeActionResult,
  ShareLinkData,
} from "@/app/actions/challenge-links";

interface Props {
  /** Creates (or reuses) the link; one of the `challenge-links` server actions. */
  create: () => Promise<ChallengeActionResult<ShareLinkData>>;
  label: string;
  /** When set, uses Web Share where the browser has it (phones). */
  share?: { title: string; text: string };
  variant?: "default" | "outline";
  size?: "default" | "sm";
  testId?: string;
  /** Runs after the link exists (e.g. to refresh a list). */
  onCreated?: () => void;
}

/**
 * Create-or-reuse a challenge link and hand it over: Web Share, else clipboard,
 * else (http origins, where `navigator.clipboard` is undefined) a selectable
 * field so the link can always be copied by hand (#1047).
 */
export function ChallengeLinkAction({
  create,
  label,
  share,
  variant = "default",
  size = "default",
  testId,
  onCreated,
}: Props) {
  const t = useTranslations("challenges.share");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  // Read after mount: `navigator` differs between server and client render.
  const canShare = useSyncExternalStore(
    () => () => {},
    () => Boolean(share) && typeof navigator.share === "function",
    () => false,
  );

  async function onClick() {
    if (pending) return;
    setPending(true);
    setError(null);
    let created = false;
    try {
      const res = await create();
      if (!res.success) {
        setError(
          res.error === "Unauthorized" ? t("errorUnauthorized") : t("error"),
        );
        return;
      }
      const link = `${window.location.origin}${res.data.path}`;
      setUrl(link);
      created = true;
      if (canShare && share) {
        try {
          await navigator.share({ ...share, url: link });
          return;
        } catch (err) {
          if ((err as Error)?.name === "AbortError") return;
        }
      }
      try {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        toast.success(res.data.reused ? t("copiedExisting") : t("copied"));
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // No clipboard (http) or permission denied: show it selected.
        setTimeout(() => field.current?.select(), 0);
      }
    } catch {
      setError(t("error"));
    } finally {
      setPending(false);
      // After handing the link over: a list refresh unmounts this row.
      if (created) onCreated?.();
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={() => void onClick()}
        disabled={pending}
        aria-busy={pending}
        data-testid={testId}
      >
        {pending ? (
          <IconLoader2 className="animate-spin" />
        ) : copied ? (
          <IconCheck />
        ) : canShare ? (
          <IconShare3 />
        ) : (
          <IconLink />
        )}
        {pending ? t("creating") : copied ? t("copiedShort") : label}
      </Button>
      {url && !copied ? (
        <div className="space-y-1">
          <label
            htmlFor={`${testId ?? "challenge"}-url`}
            className="text-xs text-muted-foreground"
          >
            {t("manualHint")}
          </label>
          <Input
            id={`${testId ?? "challenge"}-url`}
            ref={field}
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            data-testid="challenge-link-field"
            className="font-mono text-xs"
          />
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
