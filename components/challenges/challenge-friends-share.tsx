"use client";

import { useTranslations } from "next-intl";
import { createBestAttemptChallengeLink } from "@/app/actions/challenge-links";
import { ChallengeLinkAction } from "./challenge-link-action";

/** "Challenge your friends": a link carrying the member's best official attempt on this exercise. */
export function ChallengeFriendsShare({
  exerciseId,
  title,
}: {
  exerciseId: number;
  title: string;
}) {
  const t = useTranslations("challenges.share");
  return (
    <section
      aria-labelledby={`friends-${exerciseId}`}
      className="space-y-2"
      data-testid="challenge-friends"
    >
      <h3 id={`friends-${exerciseId}`} className="text-sm font-semibold">
        {t("friendsTitle")}
      </h3>
      <p className="text-sm text-muted-foreground">{t("friendsBody")}</p>
      <ChallengeLinkAction
        create={() => createBestAttemptChallengeLink(exerciseId)}
        label={t("friendsCta")}
        share={{
          title: t("shareTitle"),
          text: t("shareText", { exercise: title }),
        }}
        testId="challenge-friends-cta"
      />
    </section>
  );
}
