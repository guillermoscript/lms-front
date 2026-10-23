-- Global header / footer ("template parts"): a landing_pages row of kind 'header' or 'footer'
-- is the school-wide part rendered around every public route. At most one per kind per tenant.
ALTER TABLE public.landing_pages
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'page'
  CONSTRAINT landing_pages_kind_check CHECK (kind IN ('page', 'header', 'footer'));

CREATE UNIQUE INDEX IF NOT EXISTS landing_pages_one_part_per_kind
  ON public.landing_pages (tenant_id, kind)
  WHERE kind <> 'page';
