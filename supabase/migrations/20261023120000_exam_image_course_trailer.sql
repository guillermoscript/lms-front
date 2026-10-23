-- Exams get a cover image (like lessons.image); courses get a trailer / intro
-- video shown on the public course page.
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS image text;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS trailer_url text;
