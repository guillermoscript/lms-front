-- #398: cache fetched video transcripts on lessons so AI question generation
-- pays the caption fetch at most once per video. Shape:
--   { "source": "youtube_captions", "video_url": "...", "language": "en",
--     "segments": [{ "start": 12.4, "text": "..." }], "fetched_at": "..." }
-- Invalidation is by video_url comparison in lib/lessons/video-transcript.ts.
-- No RLS change: transcript is lesson content and follows the existing
-- lessons policies (including the #426 anon tightening).
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS transcript jsonb;

COMMENT ON COLUMN public.lessons.transcript IS
  'Cached video transcript (source, video_url, language, segments[{start,text}], fetched_at). Written server-side by lib/lessons/video-transcript.ts; invalidated when video_url changes.';
