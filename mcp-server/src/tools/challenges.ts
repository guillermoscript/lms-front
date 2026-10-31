import { z } from "zod";
import type { LmsServer } from "../server-types.js";
import { errorResult, okText, structured } from "../format.js";
import { getAppOrigin } from "../env.js";
import { LmsSession } from "../session.js";

/**
 * Exercise challenges (epic #1025, WS9 #1043): turn an essay/discussion exercise
 * into a shareable "beat my score" link, from the AI.
 *
 * `challenge_links` is server-write only (no grants for `authenticated`), and
 * this package never holds the service role for data. So the three WRITE tools
 * forward the caller's own token to the app's `POST /api/challenges/manage`,
 * which runs the SAME core as the web UI (`lib/challenges/links.ts`: type,
 * tenant opt-in, `ai_grading` plan gate, ownership, idempotency, nanoid token,
 * tenant host for the URL). The rules live there once; nothing is re-implemented
 * in this file. The ranking is a read: it calls the member-only
 * `get_challenge_ranking` RPC as the caller.
 *
 * Sending the link (WhatsApp, Slack, email) is up to the caller's other MCPs.
 */

type ManageResult = { ok: true; body: Record<string, unknown> } | { ok: false; error: string };

const REQUEST_TIMEOUT_MS = 30_000;

/** Calls the app's challenge-management route as the caller. */
export async function callChallengeApi(
  accessToken: string,
  payload: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch
): Promise<ManageResult> {
  const origin = getAppOrigin();
  if (!origin) {
    return {
      ok: false,
      error:
        "This server cannot reach the LMS app (set LMS_APP_URL or LMS_PLATFORM_DOMAIN). Manage challenges from the dashboard instead.",
    };
  }
  let res: Response;
  try {
    res = await fetchImpl(`${origin}/api/challenges/manage`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, error: "Could not reach the LMS app. Nothing was changed; try again." };
  }
  let body: Record<string, unknown> = {};
  try {
    body = ((await res.json()) ?? {}) as Record<string, unknown>;
  } catch {
    /* non-JSON (proxy error page) */
  }
  if (!res.ok) {
    const msg = typeof body.error === "string" ? body.error : `HTTP ${res.status}`;
    return { ok: false, error: res.status === 401 ? "The LMS app rejected your session. Reconnect and retry." : msg };
  }
  return { ok: true, body };
}

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export function registerChallengeTools(server: LmsServer) {
  // -------------------------------------------------------------------------
  // lms_set_exercise_challengeable
  // -------------------------------------------------------------------------
  server.tool(
    {
      name: "lms_set_exercise_challengeable",
      description:
        "Turn an exercise into (or stop it being) a public challenge that people can play from a link. " +
        "Use this BEFORE lms_create_challenge_link. Only essay, discussion and voice conversation (real_time_conversation) exercises qualify, the school must have " +
        "challenges enabled by an admin, and teachers can only change exercises in their own courses (admins: any). " +
        "Returns the new state plus a warning: the exercise title and instructions become public to anyone with a link; " +
        "on a paid course guests get only this one exercise as a sample, never course access.",
      schema: z.object({
        exercise_id: z.number().int().describe("The exercise ID"),
        enabled: z.boolean().describe("true to make it challengeable, false to turn it off"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (input, ctx) => {
      let session: LmsSession;
      try {
        session = LmsSession.fromContext(ctx);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
      const r = await callChallengeApi(session.getAccessToken(), {
        action: "set_challengeable",
        exerciseId: input.exercise_id,
        enabled: input.enabled,
      });
      if (!r.ok) return errorResult(r.error);
      const warning = typeof r.body.warning === "string" ? r.body.warning : null;
      const data = { exercise_id: input.exercise_id, is_challengeable: r.body.isChallengeable === true, warning };
      return structured(
        data,
        data.is_challengeable
          ? `Exercise ${input.exercise_id} is now challengeable. ${warning ?? ""}`.trim()
          : `Exercise ${input.exercise_id} is no longer challengeable (existing links stop working).`
      );
    }
  );

  // -------------------------------------------------------------------------
  // lms_create_challenge_link
  // -------------------------------------------------------------------------
  server.tool(
    {
      name: "lms_create_challenge_link",
      description:
        "Create a shareable challenge link for a challengeable exercise and return its URL (the tenant's own host). " +
        "By default the link is OPEN: whoever opens it plays the exercise with no score to beat. Pass use_best_attempt=true " +
        "to make the link carry YOUR best official score (\"beat my 87\"); if you have no official attempt it falls back to an " +
        "open link and says so. attempt_id shares one specific own official attempt. Calling it again returns the same link " +
        "(idempotent). Teachers: own-course exercises; admins: any; students can only share their own official result. " +
        "Does NOT send the link anywhere: give it to the user or pass it to a messaging tool. Needs the exercise to be " +
        "challengeable (lms_set_exercise_challengeable) and the school plan to include AI grading.",
      schema: z.object({
        exercise_id: z.number().int().optional().describe("The exercise ID (required unless attempt_id is given)"),
        attempt_id: z.string().optional().describe("Your own official challenge attempt to share with its score"),
        use_best_attempt: z
          .boolean()
          .optional()
          .describe("Carry your best official score on this exercise; falls back to an open link if you have none"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (input, ctx) => {
      let session: LmsSession;
      try {
        session = LmsSession.fromContext(ctx);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
      if (input.exercise_id === undefined && !input.attempt_id) {
        return errorResult("Provide exercise_id (or attempt_id).");
      }
      const r = await callChallengeApi(session.getAccessToken(), {
        action: "create_link",
        exerciseId: input.exercise_id,
        attemptId: input.attempt_id,
        useBestAttempt: input.use_best_attempt === true,
      });
      if (!r.ok) return errorResult(r.error);

      const withScore = r.body.withScore === true;
      const score = typeof r.body.score === "number" ? r.body.score : undefined;
      const data = {
        url: String(r.body.url),
        token: String(r.body.token),
        with_score: withScore,
        ...(score !== undefined ? { score } : {}),
      };
      const notes = [
        withScore ? `Carries your score (${score}).` : "Open link: no score to beat.",
        r.body.fellBackToOpen === true ? "You have no official attempt on this exercise yet, so this is an open link." : "",
        r.body.reused === true ? "An active link already existed, so it was reused." : "",
      ].filter(Boolean);
      return structured(data, `Challenge link: ${data.url}\n${notes.join(" ")}`);
    }
  );

  // -------------------------------------------------------------------------
  // lms_get_challenge_ranking
  // -------------------------------------------------------------------------
  server.tool(
    {
      name: "lms_get_challenge_ranking",
      description:
        "Ranking of an exercise's challenge inside this school: official attempts of registered people, best score first " +
        "(ties: earliest first). Names are first name + last initial only, no emails; guests who have not signed up are not " +
        "listed. Use it to see who beat a challenge link. Any member of the school can read it.",
      schema: z.object({
        exercise_id: z.number().int().describe("The exercise ID"),
      }),
      annotations: readOnly,
    },
    async (input, ctx) => {
      let session: LmsSession;
      try {
        session = LmsSession.fromContext(ctx);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
      try {
        const { data, error } = await session.getClient().rpc("get_challenge_ranking", {
          _exercise_id: input.exercise_id,
        });
        if (error) return errorResult(`Loading ranking: ${error.message}`);
        const rows = (data ?? []) as Array<{
          rank: number | string;
          display_name: string;
          score: number;
          passed: boolean;
          created_at: string;
        }>;
        const ranking = rows.map((r) => ({
          rank: Number(r.rank),
          name: r.display_name || "Anonymous",
          score: r.score,
          passed: r.passed,
          played_at: r.created_at,
        }));
        const out = { exercise_id: input.exercise_id, total: ranking.length, ranking };
        if (ranking.length === 0) return structured(out, "No one is ranked on this challenge yet.");
        const lines = ranking.map((r) => `${r.rank}. ${r.name} - ${r.score}${r.passed ? " (passed)" : ""}`);
        return structured(out, [`Ranking for exercise ${input.exercise_id}:`, ...lines].join("\n"));
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // -------------------------------------------------------------------------
  // lms_deactivate_challenge_link
  // -------------------------------------------------------------------------
  server.tool(
    {
      name: "lms_deactivate_challenge_link",
      description:
        "Turn off a challenge link so it stops working (the page returns 404). Only the person who created the link or a " +
        "school admin can do it. Takes the token from the link URL (/reto/<token>) or from lms_create_challenge_link.",
      schema: z.object({
        token: z.string().min(6).max(128).describe("The link token (the part after /reto/)"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (input, ctx) => {
      let session: LmsSession;
      try {
        session = LmsSession.fromContext(ctx);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
      const r = await callChallengeApi(session.getAccessToken(), { action: "deactivate_link", token: input.token });
      if (!r.ok) return errorResult(r.error);
      return okText("Challenge link deactivated. It no longer opens.");
    }
  );
}
