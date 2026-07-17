CREATE TABLE IF NOT EXISTS public.product_post_registration_steps (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES public.products(product_id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('whatsapp', 'telegram', 'discord', 'link', 'text')),
  title TEXT NOT NULL,
  description TEXT,
  url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_post_registration_steps_tenant_product_order
  ON public.product_post_registration_steps (tenant_id, product_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_product_post_registration_steps_product
  ON public.product_post_registration_steps (product_id);

ALTER TABLE public.product_post_registration_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant admins manage post registration steps"
  ON public.product_post_registration_steps;

CREATE POLICY "Tenant admins manage post registration steps"
  ON public.product_post_registration_steps
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.tenant_users tu
      WHERE tu.tenant_id = product_post_registration_steps.tenant_id
        AND tu.user_id = auth.uid()
        AND tu.role = 'admin'
        AND tu.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.tenant_users tu
      WHERE tu.tenant_id = product_post_registration_steps.tenant_id
        AND tu.user_id = auth.uid()
        AND tu.role = 'admin'
        AND tu.status = 'active'
    )
  );
