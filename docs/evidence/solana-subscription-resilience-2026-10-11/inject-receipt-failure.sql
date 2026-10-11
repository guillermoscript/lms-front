-- Local QA only. Scoped to the existing Devnet test subscription and one period.
BEGIN;
CREATE FUNCTION public.qa_block_solana_receipt_10002() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.payment_provider = 'solana_subs'
   AND NEW.provider_subscription_id = 'CP8Jnkz23u7V1a2Nq3n7BBTjZYB5EjhicjHCLJNbvCGE'
   AND NEW.status = 'successful'
   AND NEW.provider_metadata->>'kind' = 'renewal'
   AND (NEW.provider_metadata->>'period_start')::timestamptz = '2026-10-11 18:38:45+00'::timestamptz
 THEN RAISE EXCEPTION 'QA injected receipt persistence failure for Devnet subscription 10002'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER qa_block_solana_receipt_10002 BEFORE INSERT OR UPDATE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.qa_block_solana_receipt_10002();
COMMIT;
