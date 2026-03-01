-- Add status column to exercises table
ALTER TABLE public.exercises 
ADD COLUMN IF NOT EXISTS status public.status NOT NULL DEFAULT 'draft'::public.status;

COMMENT ON COLUMN public.exercises.status IS 'Status of the exercise: draft, published, or archived';
