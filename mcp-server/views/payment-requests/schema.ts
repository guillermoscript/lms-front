import { z } from "zod";

const paymentRequestRow = z.object({
  request_id: z.number(),
  status: z.string(),
  user_id: z.string(),
  contact_name: z.string().nullable(),
  contact_email: z.string().nullable(),
  item: z.string().nullable(),
  product_id: z.number().nullable(),
  plan_id: z.number().nullable(),
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  payment_method: z.string().nullable(),
  payment_reference: z.string().nullable(),
  reported_amount: z.number().nullable(),
  reported_currency: z.string().nullable(),
  payment_reported_at: z.string().nullable(),
  payment_confirmed_at: z.string().nullable(),
  created_at: z.string().nullable(),
  expires_at: z.string().nullable(),
  admin_notes: z.string().nullable(),
});

export const propsSchema = z.object({
  total: z.number(),
  offset: z.number(),
  // Echoed so "load more" repeats the page size and the filters.
  limit: z.number().optional(),
  has_more: z.boolean(),
  next_offset: z.number().nullable(),
  status: z.string().optional(),
  user_id: z.string().nullable().optional(),
  requests: z.array(paymentRequestRow),
});

export type Props = z.infer<typeof propsSchema>;
export type PaymentRequest = z.infer<typeof paymentRequestRow>;
