import { z } from "zod";
import type { MCPServer } from "mcp-use/server";
import { LmsSession } from "../session.js";
import { ok, errorResult } from "../format.js";

/**
 * Self-enrollment tool (Epic #348 Phase 2). Delegates entirely to the
 * self_enroll_subscription_course RPC (SECURITY DEFINER, auth.uid()-scoped) —
 * the same one lib/hooks/use-enrollment.ts calls from the app. It creates a
 * `subscription` entitlement + enrollment row only if an active subscription
 * of the caller covers the course; the RPC raises otherwise, and its message
 * is surfaced back to the student verbatim.
 */
export function registerEnrollTools(server: MCPServer) {
  server.tool(
    {
      name: "lms_enroll_in_course",
      description:
        "Self-enroll the caller in a course covered by their active subscription plan. Use this when a student wants to start a course shown in lms_browse_catalog as covered_by_plan. Fails with an explanatory error if no active subscription of the caller covers the course.",
      schema: z.object({
        course_id: z.number().describe("The course ID to enroll in"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input, ctx) => {
      let session: LmsSession;
      try {
        session = LmsSession.fromContext(ctx);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      try {
        const { error } = await session
          .getClient()
          .rpc("self_enroll_subscription_course", {
            _course_id: input.course_id,
          });

        // Surface the RPC's own message (e.g. "No active subscription covers
        // this course") — it already explains the failure to the student.
        if (error) return errorResult(error.message);

        return ok(
          { course_id: input.course_id, enrolled: true },
          `Enrolled in course ${input.course_id}.`
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );
}
