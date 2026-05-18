-- Fix product_courses primary key to allow multiple courses per product.
--
-- The original PK was (product_id) — a single-column PK that silently limits
-- each product to one course. The business model supports course bundles, and
-- enroll_user() already loops through all product_courses rows for a product
-- (Phase 3 migration). The only thing missing was the schema allowing more
-- than one row.
--
-- After this migration PostgREST returns product_courses as an array on
-- embedded selects (was: single object). The edit-page normalisation in
-- products/[productId]/edit/page.tsx already handles both shapes.

-- 1. Drop the single-column PK
ALTER TABLE public.product_courses
  DROP CONSTRAINT product_courses_pkey;

-- 2. Add composite PK — each (product, course) pair is unique
ALTER TABLE public.product_courses
  ADD CONSTRAINT product_courses_pkey PRIMARY KEY (product_id, course_id);
