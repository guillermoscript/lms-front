-- Images students attach in the AI chats (exercise coach, lesson tutor).
-- The route forwards them inline to the model and stores a copy here so the
-- conversation re-hydrates with the images instead of text-only turns.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ai-chat-attachments',
  'ai-chat-attachments',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- Written and signed by the service role only (routes validate the caller
-- first), so no storage.objects policies for `authenticated` are needed.

ALTER TABLE public.exercise_messages
  ADD COLUMN IF NOT EXISTS attachments jsonb;

ALTER TABLE public.lessons_ai_task_messages
  ADD COLUMN IF NOT EXISTS attachments jsonb;

COMMENT ON COLUMN public.exercise_messages.attachments IS
  'Array of {path, mediaType, filename} in the ai-chat-attachments bucket; NULL when the turn had no images.';
COMMENT ON COLUMN public.lessons_ai_task_messages.attachments IS
  'Array of {path, mediaType, filename} in the ai-chat-attachments bucket; NULL when the turn had no images.';
