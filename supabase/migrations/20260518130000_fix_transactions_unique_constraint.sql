-- Fix the transactions unique constraint.
--
-- The original constraint UNIQUE(user_id, product_id, plan_id) is broken:
-- SQL treats NULL != NULL in unique checks, so when plan_id IS NULL (all
-- product purchases) the constraint never fires and duplicate charges are
-- silently allowed. Alice has 3 successful transactions for product 10003
-- because of this.
--
-- Fix:
--   1. Archive test-generated duplicate transactions (keep the newest).
--   2. Drop the broken full-column unique constraint.
--   3. Add two partial unique indexes — one for product purchases, one for
--      plan purchases — that only enforce uniqueness on active rows.

-- 1. Archive duplicates created during testing ------------------------------
--    Keep the highest transaction_id (most recent) per (user, product/plan).
--    Use CTE to find IDs to archive, then update in a single statement.

-- Product duplicates: archive all but the max transaction_id per (user, product)
WITH ranked AS (
  SELECT transaction_id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, product_id
           ORDER BY transaction_id DESC
         ) AS rn
  FROM transactions
  WHERE product_id IS NOT NULL
    AND plan_id IS NULL
    AND status IN ('pending', 'successful')
)
UPDATE transactions
SET status = 'archived'
WHERE transaction_id IN (
  SELECT transaction_id FROM ranked WHERE rn > 1
);

-- Plan duplicates: archive all but the max transaction_id per (user, plan)
WITH ranked AS (
  SELECT transaction_id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, plan_id
           ORDER BY transaction_id DESC
         ) AS rn
  FROM transactions
  WHERE plan_id IS NOT NULL
    AND product_id IS NULL
    AND status IN ('pending', 'successful')
)
UPDATE transactions
SET status = 'archived'
WHERE transaction_id IN (
  SELECT transaction_id FROM ranked WHERE rn > 1
);

-- 2. Drop the broken unique constraint -------------------------------------
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_user_id_product_id_plan_id_key;

-- 3. Add correct partial unique indexes ------------------------------------
-- Product purchases: one pending/successful row per (user, product)
CREATE UNIQUE INDEX transactions_unique_product
  ON public.transactions (user_id, product_id)
  WHERE plan_id IS NULL
    AND status IN ('pending', 'successful');

-- Plan purchases: one pending/successful row per (user, plan)
CREATE UNIQUE INDEX transactions_unique_plan
  ON public.transactions (user_id, plan_id)
  WHERE product_id IS NULL
    AND status IN ('pending', 'successful');
