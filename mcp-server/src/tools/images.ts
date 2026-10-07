import { z } from "zod";
import type { LmsServer } from "../server-types.js";
import { LmsSession } from "../session.js";
import { ok, errorResult } from "../format.js";
import { getAppOrigin } from "../env.js";

/**
 * AI image generation for course thumbnails and lesson illustrations.
 *
 * BYOK: this server NEVER holds a provider key or the master key. Generation
 * runs in the LMS app (`POST /api/internal/ai/image`), authenticated by the
 * shared `MCP_PROXY_SECRET` plus the caller's own access token; the app takes
 * the tenant from that verified token, uses the SCHOOL's own image-provider
 * key, enforces the per-user daily cap in the database, and returns the bytes.
 * Here we only check course/lesson ownership, then upload AS THE CALLER (their
 * token, RLS-scoped) into the existing public `course-images` bucket,
 * tenant-prefixed (`<tenantId>/...`) exactly like
 * `app/actions/teacher/course-images.ts`.
 *
 * Not configured (no secret, no app address, or the school has no image key)
 * -> a clear model-readable error, nothing generated, nothing uploaded.
 */

export const IMAGE_BUCKET = "course-images";
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PROMPT_CHARS = 1000;
const REQUEST_TIMEOUT_MS = 110_000;
const EXT_BY_TYPE: Record<string, string> = {
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
};
const STYLES = ["illustration", "photo", "flat", "3d", "minimal", "watercolor"] as const;
const STYLE_HINTS: Record<(typeof STYLES)[number], string> = {
  illustration: "clean digital illustration",
  photo: "realistic photograph, natural light",
  flat: "flat vector design, bold shapes",
  "3d": "soft 3D render",
  minimal: "minimalist composition, lots of negative space",
  watercolor: "watercolor painting",
};

export function buildImagePrompt(prompt: string, style?: (typeof STYLES)[number]): string {
  return [
    prompt.trim(),
    style ? `Style: ${STYLE_HINTS[style]}.` : "",
    "No text, letters, logos or watermarks in the image.",
  ]
    .filter(Boolean)
    .join(" ");
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

const NOT_CONFIGURED =
  "AI image generation is not set up for this school. A school admin must add an image-capable AI key (OpenAI or Google) in Settings > AI (/dashboard/admin/settings/ai). Nothing was generated.";

/** Model-readable message for a failed internal call; never echoes a provider body. */
export function describeImageFailure(status: number, code: string | undefined, reason?: string): string {
  switch (code) {
    case "ai_not_configured":
      return NOT_CONFIGURED;
    case "ai_key_invalid":
      return "The school's AI image key was rejected by the provider. A school admin must replace it in Settings > AI.";
    case "ai_model_unsupported":
      return "The school's selected image model is not available with its key. A school admin must pick another image model in Settings > AI.";
    case "ai_quota":
      return "The school's AI provider reports its quota or billing limit was reached. Try again later or ask the admin to check the provider account.";
    case "ai_provider_error":
      return "The AI provider failed to generate the image. Try again, or upload an image manually.";
    case "image_rate_limited":
      return reason === "cooldown"
        ? "Wait a few seconds before generating another image."
        : "Daily AI image limit reached for your account. Try again tomorrow or upload an image manually.";
    case "image_too_large":
      return "Generated image is larger than 5MB. Try a simpler prompt.";
    case "internal_not_configured":
      return NOT_CONFIGURED;
    case "forbidden":
      return "Only teachers and admins of this school can generate images.";
    case "unauthorized":
      return "The LMS app rejected this server's request (check MCP_PROXY_SECRET matches the app's). Nothing was generated.";
    default:
      return `Image generation failed (HTTP ${status}). Nothing was generated.`;
  }
}

export interface InternalImageResult {
  bytes: Uint8Array;
  mediaType: string;
}

/** Calls the app's internal route. Returns an error string on any failure. */
export async function requestImageFromApp(
  accessToken: string,
  prompt: string,
  fetchImpl: typeof fetch = fetch
): Promise<InternalImageResult | { error: string }> {
  const secret = process.env.MCP_PROXY_SECRET?.trim();
  const origin = getAppOrigin();
  if (!secret || !origin) return { error: NOT_CONFIGURED };

  let res: Response;
  try {
    res = await fetchImpl(`${origin}/api/internal/ai/image`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-MCP-Secret": secret,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt }),
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    return {
      error:
        name === "TimeoutError" || name === "AbortError"
          ? "Image generation timed out. Try a simpler prompt."
          : "Could not reach the LMS app to generate the image. Nothing was generated.",
    };
  }

  let body: Record<string, unknown> = {};
  try {
    body = ((await res.json()) ?? {}) as Record<string, unknown>;
  } catch {
    /* non-JSON (proxy error page) */
  }

  if (!res.ok) {
    const err = (body.error ?? {}) as { code?: unknown; reason?: unknown };
    return {
      error: describeImageFailure(
        res.status,
        typeof err.code === "string" ? err.code : undefined,
        typeof err.reason === "string" ? err.reason : undefined
      ),
    };
  }

  if (typeof body.image !== "string" || typeof body.mediaType !== "string" || !EXT_BY_TYPE[body.mediaType]) {
    return { error: "The LMS app returned an unexpected image response. Nothing was generated." };
  }
  const bytes = new Uint8Array(Buffer.from(body.image, "base64"));
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    return { error: "Generated image is larger than 5MB. Try a simpler prompt." };
  }
  return { bytes, mediaType: body.mediaType };
}

interface Generated {
  url: string;
  path: string;
}

/** Generates (in the app), then uploads as the caller. Returns an error string on failure. */
async function generateAndUpload(
  session: LmsSession,
  folder: string,
  prompt: string,
  style?: (typeof STYLES)[number]
): Promise<Generated | { error: string }> {
  const generated = await requestImageFromApp(session.getAccessToken(), buildImagePrompt(prompt, style));
  if ("error" in generated) return generated;

  const path = `${session.getTenantId()}/${folder}/${crypto.randomUUID()}.${EXT_BY_TYPE[generated.mediaType]}`;
  const storage = session.getClient().storage.from(IMAGE_BUCKET);
  const { error } = await storage.upload(path, generated.bytes, {
    contentType: generated.mediaType,
    upsert: false,
  });
  if (error) return { error: `Uploading image: ${error.message}` };
  return { url: storage.getPublicUrl(path).data.publicUrl, path };
}

export function registerImageTools(server: LmsServer) {
  // ── lms_generate_course_image ───────────────────────────────────────────────
  server.tool(
    {
      name: "lms_generate_course_image",
      description:
        "Generate an AI cover image for a course, upload it to the school's public image storage and (by default) set it as the course thumbnail. Runs on the school's own AI key (set by an admin in Settings > AI); capped per user per day. Write a prompt describing a single clear subject matching the course topic, 3:2 wide composition, NO text or logos in the image. Returns the public URL.",
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
        "Generate an AI illustration for a lesson and return a markdown-ready image snippet to place inside the lesson content (e.g. via lms_update_lesson_content). Does not modify the lesson. Runs on the school's own AI key (set by an admin in Settings > AI); capped per user per day. No text in the image.",
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
