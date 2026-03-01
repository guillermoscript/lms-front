-- Add template support to exercises
ALTER TABLE public.exercises
ADD COLUMN template_id bigint REFERENCES public.prompt_templates(id),
ADD COLUMN template_variables jsonb;

-- Comment for clarity
COMMENT ON COLUMN public.exercises.template_id IS 'Reference to the prompt template used for this exercise';
COMMENT ON COLUMN public.exercises.template_variables IS 'Variables used to populate the template (e.g., topic, criteria)';
