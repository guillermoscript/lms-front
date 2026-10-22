-- Outbound webhooks: platform fee statement event (emit only; never gates access).
-- Separate file on purpose: see tests/unit/fee-standing-access-contract.test.ts.

CREATE OR REPLACE FUNCTION public.trg_webhook_platform_fee_statement()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    PERFORM public.emit_outbound_webhook(NEW.tenant_id, 'platform_fee.statement_created', jsonb_build_object(
      'statement_id', NEW.statement_id,
      'statement_number', NEW.statement_number,
      'fee_amount', NEW.fee_amount,
      'currency', NEW.currency,
      'period_start', NEW.period_start,
      'period_end', NEW.period_end,
      'due_at', NEW.due_at
    ), TRUE);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_webhook_platform_fee_statement failed: %', SQLERRM;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_webhook_platform_fee_statement
  AFTER INSERT ON public.platform_fee_statements
  FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_platform_fee_statement();
