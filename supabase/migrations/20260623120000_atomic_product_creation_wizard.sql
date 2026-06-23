-- Atomic persistence for the admin product/course creation wizard.
--
-- Before this migration, `saveProductCreationWizard` ran ~5 sequential
-- adminClient writes with no transaction: a failure midway left orphaned rows
-- (a course with no product, or a product with no sellable course link / stale
-- post-registration steps). This RPC moves every DB write into ONE transaction
-- so the whole offering commits or nothing does.
--
-- Payment-provider objects (Stripe/PayPal product + price) are external API
-- calls and CANNOT live inside a Postgres transaction. The server action
-- resolves them BEFORE calling this RPC and passes the resulting ids in; if the
-- RPC then fails, the action archives the objects it just created (compensation).
-- For the `manual` provider those calls are no-ops, so there is nothing to leak.
--
-- Tenant ownership is re-verified inside the function (not just trusted from the
-- caller) so the service-role admin client still cannot cross tenants.

CREATE OR REPLACE FUNCTION public.save_product_creation_wizard(
  _tenant_id uuid,
  _author_id uuid,
  _intent text,                 -- 'draft' | 'publish'
  _source_mode text,            -- 'new' | 'existing'
  _existing_course_id integer,  -- nullable
  _course jsonb,                -- { title, description, thumbnail_url, category_id }
  _pricing_mode text,           -- 'free' | 'paid'
  _product_id integer,          -- nullable (edit)
  _product jsonb,               -- paid: { price, currency, payment_provider, provider_product_id, provider_price_id }; else null
  _steps jsonb                  -- array of { type, title, description, url, sort_order, is_active }
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _course_id   integer;
  _new_product integer;
  _course_status text := CASE WHEN _intent = 'publish' THEN 'published' ELSE 'draft' END;
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
      title        = _course->>'title',
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

  -- 2a. Free offering — no product. Clean up any prior paid attachment. -------
  IF _pricing_mode = 'free' THEN
    IF _product_id IS NOT NULL THEN
      -- Verify ownership, then soft-archive the product and detach it from the
      -- course so the now-free course is not still linked to a paid product or
      -- carrying stale post-registration steps (the orphan case).
      PERFORM 1 FROM products
        WHERE product_id = _product_id AND tenant_id = _tenant_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Product % not found or access denied', _product_id
          USING ERRCODE = 'P0002';
      END IF;

      UPDATE products SET status = 'inactive'
        WHERE product_id = _product_id AND tenant_id = _tenant_id;

      DELETE FROM product_post_registration_steps
        WHERE product_id = _product_id AND tenant_id = _tenant_id;
      DELETE FROM product_courses
        WHERE product_id = _product_id AND tenant_id = _tenant_id;
    END IF;

    RETURN jsonb_build_object('course_id', _course_id, 'product_id', NULL);
  END IF;

  -- 2b. Paid offering — upsert product ---------------------------------------
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
      price               = (_product->>'price')::numeric,
      currency            = (_product->>'currency')::currency_type,
      image               = NULLIF(_course->>'thumbnail_url', ''),
      payment_provider    = _product->>'payment_provider',
      provider_product_id = NULLIF(_product->>'provider_product_id', ''),
      provider_price_id   = NULLIF(_product->>'provider_price_id', ''),
      status              = CASE WHEN _intent = 'publish' THEN 'active' ELSE 'inactive' END
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
      (_product->>'price')::numeric,
      (_product->>'currency')::currency_type,
      NULLIF(_course->>'thumbnail_url', ''),
      _product->>'payment_provider',
      NULLIF(_product->>'provider_product_id', ''),
      NULLIF(_product->>'provider_price_id', ''),
      CASE WHEN _intent = 'publish' THEN 'active' ELSE 'inactive' END
    )
    RETURNING product_id INTO _new_product;
  END IF;

  -- 3. Re-link product → course (single course per offering) ------------------
  DELETE FROM product_courses
    WHERE product_id = _new_product AND tenant_id = _tenant_id;
  INSERT INTO product_courses (tenant_id, product_id, course_id)
    VALUES (_tenant_id, _new_product, _course_id);

  -- 4. Replace post-registration steps ---------------------------------------
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

-- Keep updated_at honest: it has DEFAULT NOW() but nothing bumped it on UPDATE.
CREATE OR REPLACE FUNCTION public.set_product_post_registration_steps_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_product_post_registration_steps_updated_at
  ON public.product_post_registration_steps;

CREATE TRIGGER trigger_set_product_post_registration_steps_updated_at
  BEFORE UPDATE ON public.product_post_registration_steps
  FOR EACH ROW
  EXECUTE FUNCTION public.set_product_post_registration_steps_updated_at();
