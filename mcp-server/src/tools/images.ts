import { z } from "zod";
import { generateImage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import type { LmsServer } from "../server-types.js";
import { LmsSession } from "../session.js";
import { ok, errorResult } from "../format.js";

/**
 * AI image generation for course thumbnails and lesson illustrations.
 *
 * Uploads happen AS THE CALLER (their token, RLS-scoped) into the existing
 * public `course-images` bucket, tenant-prefixed (`<tenantId>/...`) exactly
 * like `app/actions/teacher/course-images.ts`. Its storage policy only
 * requires an authenticated user, so no migration is needed; tenant/role gating
 * is the handler's job (course/lesson ownership check below).
 *
 * Guardrails: prompt length cap, 5MB output cap (the bucket limit), per-user
 * daily cap + short cooldown (in-memory — per server process, resets on
 * restart; good enough to bound cost, not a billing control), missing key →
 * clean error. No plan-feature gate: no AI-images key exists in
 * `lib/plans/features.ts`.
 */

export const IMAGE_BUCKET = "course-images";
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PROMPT_CHARS = 1000;
const DEFAULT_DAILY_CAP = 20;
const COOLDOWN_MS = 5_000;
// Allowed by the bucket's allowed_mime_types; webp keeps files well under 5MB.
const OUTPUT_FORMAT = "webp";
const STYLES = ["illustration", "photo", "flat", "3d", "minimal", "watercolor"] as const;
const STYLE_HINTS: Record<(typeof STYLES)[number], string> = {
  illustration: "clean digital illustration",
  photo: "realistic photograph, natural light",
  flat: "flat vector design, bold shapes",
  "3d": "soft 3D render",
  minimal: "minimalist composition, lots of negative space",
  watercolor: "watercolor painting",
};

export function dailyCap(): number {
  const n = Number(process.env.MCP_IMAGE_DAILY_CAP);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_DAILY_CAP;
}

const usage = new Map<string, { day: string; count: number; last: number }>();

/** Reserves one generation for the user, or returns the reason it is refused. */
export function reserveImageQuota(userId: string, now = Date.now()): string | null {
  const day = new Date(now).toISOString().slice(0, 10);
  const u = usage.get(userId);
  const cur = u && u.day === day ? u : { day, count: 0, last: 0 };
  if (now - cur.last < COOLDOWN_MS) return "Wait a few seconds before generating another image.";
  if (cur.count >= dailyCap()) {
    return `Daily AI image limit reached (${dailyCap()}/day per user). Try again tomorrow or upload an image manually.`;
  }
  usage.set(userId, { day, count: cur.count + 1, last: now });
  return null;
}

export function releaseImageQuota(userId: string) {
  const u = usage.get(userId);
  if (u && u.count > 0) usage.set(userId, { ...u, count: u.count - 1, last: 0 });
}

export function resetImageQuotaForTests() {
  usage.clear();
}

export function imageModelId(): string {
  return process.env.MCP_IMAGE_MODEL?.trim() || "gpt-image-1-mini";
}

export function buildImagePrompt(prompt: string, style?: (typeof STYLES)[number]): string {
  return [
    prompt.trim(),
    style ? `Style: ${STYLE_HINTS[style]}.` : "",
    "No text, letters, logos or watermarks in the image.",
  ]
    .filter(Boolean)
    .join(" ");
}

function apiKey(): string | null {
  return process.env.OPENAI_API_KEY?.trim() || null;
}

const promptField = z
  .string()
  .trim()
  .min(8)
  .max(MAX_PROMPT_CHARS)
  .describe(
    "What to depict. Describe subject, setting and mood in English or Spanish. Do NOT ask for text in the image (models render it badly). Wide 3:2 landscape is generated."
  );
const styleField = z.enum(STYLES).optional().describe("Optional visual style");

export const generateCourseImageInput = z.object({
  course_id: z.number().int().describe("The course ID"),
  prompt: promptField,
  style: styleField,
  set_as_thumbnail: z
    .boolean()
    .default(true)
    .describe("Set the generated image as the course thumbnail (default true)"),
});

export const generateLessonImageInput = z.object({
  lesson_id: z.number().int().describe("The lesson ID (ownership is verified)"),
  prompt: promptField,
  style: styleField,
});

interface Generated {
  url: string;
  path: string;
}

/** Generates, size-checks and uploads as the caller. Returns an error string on failure. */
async function generateAndUpload(
  session: LmsSession,
  folder: string,
  prompt: string,
  style?: (typeof STYLES)[number]
): Promise<Generated | { error: string }> {
  const key = apiKey();
  if (!key) {
    return { error: "AI image generation is not configured on this server (OPENAI_API_KEY is missing)." };
  }
  const refused = reserveImageQuota(session.getUserId());
  if (refused) return { error: refused };

  try {
    const openai = createOpenAI({ apiKey: key });
    const { image } = await generateImage({
      model: openai.image(imageModelId()),
      prompt: buildImagePrompt(prompt, style),
      size: "1536x1024",
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(90_000),
      providerOptions: { openai: { quality: "medium", outputFormat: OUTPUT_FORMAT } },
    });
    const bytes = image.uint8Array;
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      return { error: "Generated image is larger than 5MB. Try a simpler prompt." };
    }

    const path = `${session.getTenantId()}/${folder}/${crypto.randomUUID()}.${OUTPUT_FORMAT}`;
    const storage = session.getClient().storage.from(IMAGE_BUCKET);
    const { error } = await storage.upload(path, bytes, {
      contentType: `image/${OUTPUT_FORMAT}`,
      upsert: false,
    });
    if (error) return { error: `Uploading image: ${error.message}` };
    return { url: storage.getPublicUrl(path).data.publicUrl, path };
  } catch (err) {
    // The generation (and its cost) may have failed before billing; give the slot back.
    releaseImageQuota(session.getUserId());
    const msg = (err instanceof Error ? err.message : String(err)).replace(/sk-[A-Za-z0-9_*.-]+/g, "sk-***");
    return { error: `Image generation failed: ${msg}` };
  }
}

export function registerImageTools(server: LmsServer) {
  // ── lms_generate_course_image ───────────────────────────────────────────────
  server.tool(
    {
      name: "lms_generate_course_image",
      description:
        "Generate an AI cover image for a course, upload it to the school's public image storage and (by default) set it as the course thumbnail. Costs money per call; capped per user per day. Write a prompt describing a single clear subject matching the course topic, 3:2 wide composition, NO text or logos in the image. Returns the public URL.",
      schema: generateCourseImageInput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (rawInput, ctx) => {
      try {
        const session = LmsSession.fromContext(ctx);
        const input = generateCourseImageInput.parse(rawInput);
        await session.verifyCourseOwnership(input.course_id);

        const res = await generateAndUpload(session, `courses/${input.course_id}`, input.prompt, input.style);
        if ("error" in res) return errorResult(res.error);

        if (input.set_as_thumbnail) {
          const { error } = await session
            .getClient()
            .from("courses")
            .update({ thumbnail_url: res.url })
            .eq("course_id", input.course_id)
            .eq("tenant_id", session.getTenantId());
          if (error) {
            return errorResult(
              `Image uploaded (${res.url}) but setting the thumbnail failed: ${error.message}`
            );
          }
        }
        return ok(
          { url: res.url, course_id: input.course_id, thumbnail_set: input.set_as_thumbnail },
          input.set_as_thumbnail
            ? `Cover image generated and set as the thumbnail of course ${input.course_id}.\n${res.url}`
            : `Cover image generated (not applied).\n${res.url}`
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_generate_lesson_image ───────────────────────────────────────────────
  server.tool(
    {
      name: "lms_generate_lesson_image",
      description:
        "Generate an AI illustration for a lesson and return a markdown-ready image snippet to place inside the lesson content (e.g. via lms_update_lesson_content). Does not modify the lesson. Costs money per call; capped per user per day. No text in the image.",
      schema: generateLessonImageInput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (rawInput, ctx) => {
      try {
        const session = LmsSession.fromContext(ctx);
        const input = generateLessonImageInput.parse(rawInput);
        const courseId = await session.verifyLessonOwnership(input.lesson_id);

        const res = await generateAndUpload(
          session,
          `courses/${courseId}/lessons/${input.lesson_id}`,
          input.prompt,
          input.style
        );
        if ("error" in res) return errorResult(res.error);

        const alt = input.prompt.replace(/[\[\]()<>{}`\n\r]/g, " ").slice(0, 100).trim();
        const markdown = `![${alt}](${res.url})`;
        return ok(
          { url: res.url, markdown, lesson_id: input.lesson_id },
          `Lesson image generated.\n${markdown}`
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );
}
