BEGIN;
DROP TRIGGER IF EXISTS qa_block_solana_receipt_10002 ON public.transactions;
DROP FUNCTION IF EXISTS public.qa_block_solana_receipt_10002();
COMMIT;
