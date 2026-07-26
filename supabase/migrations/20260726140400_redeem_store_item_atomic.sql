-- =============================================================================
-- Store redemption: one locking RPC replaces three unsynchronized writes
-- Issue #549 §6 (epic #540). Backs supabase/functions/spend-points.
--
-- The edge function performed, with no transaction and no atomic increment:
--   * total_coins_spent = <value read earlier in the request> + price
--   * a second independent read-modify-write of streak_freezes_available
--   * a count() followed by an insert for the max_per_user cap
--
-- The coin balance is DERIVED (floor(total_xp / 10) - total_coins_spent), so a
-- lost update means the student keeps the item AND the coins: two parallel
-- purchases cost one item's price. The same race exceeds the 5-freeze ceiling
-- and the monthly cap that #394 introduced as the anti-farm control. In the
-- other direction, buying a freeze while already at 5 spent the coins, granted
-- nothing (Math.min(existing + 1, 5)) and returned success.
--
-- Everything now happens under one SELECT ... FOR UPDATE on the profile row:
-- balance read, cap count, redemption insert, both counter updates. The lock is
-- per (user, tenant), so it serializes exactly the redemptions that contend and
-- nothing else.
--
-- NOTE ON THE UNIQUE INDEX the issue proposes for the monthly cap: it does not
-- fit. streak_freeze is seeded with max_per_user = 5, not 1
-- (20260216000001_seed_gamification_data.sql), and a unique index cannot
-- express "at most 5 per calendar month" — adding one would silently cap the
-- item at 1/month and change product behaviour. The profile row lock already
-- serializes every redemption for a given user, which is what makes the
-- surviving count-then-insert safe.
--
-- Service-role only: the edge function verifies the caller's JWT itself and
-- then calls with the admin client, where auth.uid() is NULL — hence _user_id
-- as a parameter. This must NOT be reachable by authenticated clients, or a
-- student could grant themselves items.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.redeem_store_item(
  _user_id UUID,
  _tenant_id UUID,
  _item_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item          RECORD;
  v_total_xp      INT;
  v_spent         INT;
  v_freezes       INT;
  v_available     INT;
  v_count         INT;
  v_window_start  TIMESTAMPTZ;
  v_expires       TIMESTAMPTZ;
  v_is_freeze     BOOLEAN;
BEGIN
  SELECT id, slug, name, price_coins, max_per_user
    INTO v_item
  FROM gamification_store_items
  WHERE id = _item_id
    AND is_available = true
    AND (tenant_id IS NULL OR tenant_id = _tenant_id);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'item_not_found',
                              'error', 'Item not found or inactive');
  END IF;

  v_is_freeze := v_item.slug = 'streak_freeze';

  -- ---------------------------------------------------------------------------
  -- THE lock. Every read and write below runs under it.
  -- ---------------------------------------------------------------------------
  SELECT total_xp, total_coins_spent, COALESCE(streak_freezes_available, 0)
    INTO v_total_xp, v_spent, v_freezes
  FROM gamification_profiles
  WHERE user_id = _user_id AND tenant_id = _tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'no_profile',
                              'error', 'Gamification profile not found');
  END IF;

  v_available := floor(v_total_xp / 10.0)::int - v_spent;

  IF v_available < v_item.price_coins THEN
    RETURN jsonb_build_object('ok', false, 'code', 'insufficient_coins',
                              'error', 'Insufficient coins',
                              'available', v_available,
                              'required', v_item.price_coins);
  END IF;

  -- Refuse at the ceiling instead of charging for a grant that cannot land.
  IF v_is_freeze AND v_freezes >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'freeze_ceiling',
                              'error', 'You already hold the maximum of 5 streak freezes');
  END IF;

  IF v_item.max_per_user IS NOT NULL THEN
    -- streak_freeze caps PER CALENDAR MONTH (#394); every other item is
    -- lifetime-capped. UTC month start matches the edge function's previous
    -- Date.UTC(...) boundary, so the cap window does not shift under this change.
    v_window_start := CASE
      WHEN v_is_freeze THEN date_trunc('month', (now() AT TIME ZONE 'utc')) AT TIME ZONE 'utc'
      ELSE '-infinity'::timestamptz
    END;

    SELECT count(*) INTO v_count
    FROM gamification_redemptions
    WHERE user_id = _user_id
      AND tenant_id = _tenant_id
      AND item_id = _item_id
      AND redeemed_at >= v_window_start;

    IF v_count >= v_item.max_per_user THEN
      RETURN jsonb_build_object('ok', false, 'code', 'cap_reached', 'error',
        CASE WHEN v_is_freeze
             THEN 'Monthly redemption limit reached for this item'
             ELSE 'Maximum redemptions reached for this item' END);
    END IF;
  END IF;

  INSERT INTO gamification_redemptions (user_id, item_id, coins_spent, tenant_id)
  VALUES (_user_id, _item_id, v_item.price_coins, _tenant_id);

  -- Atomic increment off the stored value, not off the value read at the top of
  -- the request. The freeze grant rides the same UPDATE.
  UPDATE gamification_profiles
  SET total_coins_spent = total_coins_spent + v_item.price_coins,
      streak_freezes_available = CASE
        WHEN v_is_freeze THEN COALESCE(streak_freezes_available, 0) + 1
        ELSE streak_freezes_available
      END,
      updated_at = now()
  WHERE user_id = _user_id AND tenant_id = _tenant_id;

  IF v_item.slug IN ('double_xp_1h', 'hint_token', 'early_access') THEN
    v_expires := CASE v_item.slug
      WHEN 'double_xp_1h' THEN now() + interval '1 hour'
      WHEN 'early_access' THEN now() + interval '7 days'
      ELSE NULL
    END;

    INSERT INTO gamification_user_rewards
      (user_id, reward_type, reward_data, expires_at, is_active, tenant_id)
    VALUES
      (_user_id, v_item.slug,
       jsonb_build_object('item_id', v_item.id, 'item_name', v_item.name),
       v_expires, true, _tenant_id);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'item', jsonb_build_object('id', v_item.id, 'name', v_item.name, 'slug', v_item.slug),
    'coins_spent', v_item.price_coins,
    'coins_remaining', v_available - v_item.price_coins,
    'streak_freezes_available', CASE WHEN v_is_freeze THEN v_freezes + 1 ELSE v_freezes END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_store_item(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_store_item(UUID, UUID, UUID) TO service_role;

COMMENT ON FUNCTION public.redeem_store_item(UUID, UUID, UUID) IS
  'Atomic store redemption under a profile row lock: balance check, cap check, '
  'redemption insert, coin debit and reward grant in one unit. service_role '
  'only — the caller is responsible for authenticating _user_id (issue #549).';
