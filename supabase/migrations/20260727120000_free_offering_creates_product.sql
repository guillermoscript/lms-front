-- Free offerings get a real product row (price 0, manual provider).
--
-- Before this migration the `_pricing_mode = 'free'` branch returned right after
-- the course insert with `product_id => NULL`, so "create a free product" in the
-- admin wizard created a course and nothing else. Consequences:
--   * the wizard redirects to /dashboard/admin/products, which lists `products`
--     rows only — the offering the admin just created was invisible there;
--   * the offering had no edit route at all (that route is keyed by product_id);
--   * free offerings could never appear anywhere driven by `products`
--     (landing-page pricing blocks, product analytics).
--
-- Free stays free: price is forced to 0 and the provider to `manual`, and every
-- consumer already treats a 0-price product as free rather than sellable —
-- `enrollFree` only rejects a linked product whose price is non-zero, and the
-- public checkout only enters the paid flow for a linked product with price > 0
-- (otherwise it redirects to the one-click free-enrollment page). So a 0-price
-- row can never be charged for; it just makes the offering a first-class,
-- listable, editable object.
--
-- The free and paid paths now share ONE upsert: the only difference is the
-- product payload, resolved up front. Everything still commits in a single
-- transaction, and tenant ownership is still re-verified inside the function.

CREATE OR REPLACE FUNCTION public.save_product_creation_wizard(
  _tenant_id uuid,
  _author_id uuid,
  _intent text,                 -- 'draft' | 'publish'
  _source_mode text,            -- 'new' | 'existing'
  _existing_course_id integer,  -- nullable
  _course jsonb,                -- { title, description, thumbnail_url, category_id }
  _pricing_mode text,           -- 'free' | 'paid'
  _product_id integer,          -- nullable (edit)
  _product jsonb,               -- paid: { price, currency, payment_provider, provider_product_id, provider_price_id }; free: optional { currency }
  _steps jsonb                  -- array of { type, title, description, url, sort_order, is_active }
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _course_id      integer;
  _new_product    integer;
  _course_status  text := CASE WHEN _intent = 'publish' THEN 'published' ELSE 'draft' END;
  _product_status text := CASE WHEN _intent = 'publish' THEN 'active' ELSE 'inactive' END;
  _effective      jsonb;
  _step jsonb;
BEGIN
  -- 1. Course -----------------------------------------------------------------
  IF _source_mode = 'existing' THEN
    SELECT course_id INTO _course_id
    FROM courses
    WHERE course_id = _existing_course_id
      AND tenant_id = _tenant_id
    FOR UPDATE;

    IF _course_id IS NULL THEN
      RAISE EXCEPTION 'Course % not found or access denied', _existing_course_id
        USING ERRCODE = 'P0002';
    END IF;

    UPDATE courses SET
      title         = _course->>'title',
      description   = NULLIF(_course->>'description', ''),
      thumbnail_url = NULLIF(_course->>'thumbnail_url', ''),
      category_id   = NULLIF(_course->>'category_id', '')::integer,
      status        = _course_status::status
    WHERE course_id = _course_id
      AND tenant_id = _tenant_id;
  ELSE
    INSERT INTO courses (title, description, thumbnail_url, category_id, status, tenant_id, author_id)
    VALUES (
      _course->>'title',
      NULLIF(_course->>'description', ''),
      NULLIF(_course->>'thumbnail_url', ''),
      NULLIF(_course->>'category_id', '')::integer,
      _course_status::status,
      _tenant_id,
      _author_id
    )
    RETURNING course_id INTO _course_id;
  END IF;

  -- 2. Resolve the product payload -------------------------------------------
  -- Free is a fixed shape the caller cannot influence beyond the display
  -- currency: price 0, `manual` provider, no external catalog ids. A paid
  -- offering later switched to free therefore keeps its identity (same
  -- product_id, same course link) instead of being archived and detached — the
  -- server action archives its Stripe/PayPal objects before calling this.
  IF _pricing_mode = 'free' THEN
    _effective := jsonb_build_object(
      'price', 0,
      'currency', COALESCE(NULLIF(_product->>'currency', ''), 'usd'),
      'payment_provider', 'manual',
      'provider_product_id', NULL,
      'provider_price_id', NULL
    );
  ELSE
    _effective := _product;
  END IF;

  -- 3. Upsert the product -----------------------------------------------------
  IF _product_id IS NOT NULL THEN
    PERFORM 1 FROM products
      WHERE product_id = _product_id AND tenant_id = _tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % not found or access denied', _product_id
        USING ERRCODE = 'P0002';
    END IF;

    UPDATE products SET
      name                = _course->>'title',
      description         = NULLIF(_course->>'description', ''),
      price               = (_effective->>'price')::numeric,
      currency            = (_effective->>'currency')::currency_type,
      image               = NULLIF(_course->>'thumbnail_url', ''),
      payment_provider    = _effective->>'payment_provider',
      provider_product_id = NULLIF(_effective->>'provider_product_id', ''),
      provider_price_id   = NULLIF(_effective->>'provider_price_id', ''),
      status              = _product_status
    WHERE product_id = _product_id AND tenant_id = _tenant_id;

    _new_product := _product_id;
  ELSE
    INSERT INTO products (
      tenant_id, name, description, price, currency, image,
      payment_provider, provider_product_id, provider_price_id, status
    )
    VALUES (
      _tenant_id,
      _course->>'title',
      NULLIF(_course->>'description', ''),
      (_effective->>'price')::numeric,
      (_effective->>'currency')::currency_type,
      NULLIF(_course->>'thumbnail_url', ''),
      _effective->>'payment_provider',
      NULLIF(_effective->>'provider_product_id', ''),
      NULLIF(_effective->>'provider_price_id', ''),
      _product_status
    )
    RETURNING product_id INTO _new_product;
  END IF;

  -- 4. Re-link product → course (single course per offering) ------------------
  DELETE FROM product_courses
    WHERE product_id = _new_product AND tenant_id = _tenant_id;
  INSERT INTO product_courses (tenant_id, product_id, course_id)
    VALUES (_tenant_id, _new_product, _course_id);

  -- 5. Replace post-registration steps ---------------------------------------
  DELETE FROM product_post_registration_steps
    WHERE product_id = _new_product AND tenant_id = _tenant_id;

  IF _steps IS NOT NULL AND jsonb_typeof(_steps) = 'array' THEN
    FOR _step IN SELECT * FROM jsonb_array_elements(_steps)
    LOOP
      INSERT INTO product_post_registration_steps (
        tenant_id, product_id, type, title, description, url, sort_order, is_active
      )
      VALUES (
        _tenant_id,
        _new_product,
        _step->>'type',
        _step->>'title',
        NULLIF(_step->>'description', ''),
        NULLIF(_step->>'url', ''),
        COALESCE((_step->>'sort_order')::integer, 0),
        COALESCE((_step->>'is_active')::boolean, true)
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object('course_id', _course_id, 'product_id', _new_product);
END;
$function$;
