-- Payment proof columns for platform (school admin) requests
ALTER TABLE platform_payment_requests ADD COLUMN IF NOT EXISTS proof_url TEXT;
ALTER TABLE platform_payment_requests ADD COLUMN IF NOT EXISTS request_type VARCHAR(20) DEFAULT 'upgrade' CHECK (request_type IN ('upgrade', 'renewal'));

-- Payment proof column for student payment requests
ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS proof_url TEXT;

-- Grace period tracking for manual subscriptions
ALTER TABLE platform_subscriptions ADD COLUMN IF NOT EXISTS grace_period_end TIMESTAMPTZ;

-- Storage bucket for payment proofs
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: authenticated users can upload their own proofs
CREATE POLICY "Users upload payment proofs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'payment-proofs' AND auth.uid() IS NOT NULL);

-- Storage RLS: authenticated users can read proofs
CREATE POLICY "Users read payment proofs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'payment-proofs' AND auth.uid() IS NOT NULL);
