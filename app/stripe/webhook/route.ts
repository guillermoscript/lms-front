// app/api/stripe-webhook/route.ts
import { NextResponse } from "next/server";
import { Stripe } from "stripe";
import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Stripe will give you a webhook secret when setting up webhooks.
// well get this later and add it to the .env.local file when testing
const webhookSecret = process.env.STRIPE_WEBHOOKS_ENDPOINT_SECRET!;

export async function POST(req: Request) {
    const payload = await req.text();
    const signature = req.headers.get("stripe-signature");
    const cookieStore = cookies()
    const supabase = createClient(cookieStore)

    let event: Stripe.Event | null = null;
    try {
        event = stripe.webhooks.constructEvent(payload, signature!, webhookSecret);
        switch (event?.type) {
            case "payment_intent.succeeded":
                // handle payment_intent.succeded
                console.log(event, '<----------- event')
                // const stripeCustomerID = event.data.object.customer
                // const productId = event.data.object.metadata.productId

                break;
            case "checkout.session.completed":
                // handle checkout.session.completed
                console.log(event, '<----------- event')

                const stripeCustomerID = event.data.object.customer
                const productId = event.data.object.metadata?.productId
                const invoiceId = event.data.object.metadata?.invoiceId

                console.log(stripeCustomerID, '<----------- stripeCustomerID')
                console.log(productId, '<----------- productId')

                // update invoice and set it to paid
                const update = await supabase.from('invoices').update({ status: 'paid' }).match({ id: invoiceId })

                console.log(update, '<----------- update')

                break;
            case "payment_intent.payment_failed":
                // handle other type of stripe events
                console.log(event, '<----------- event')
                break;
            default:
                // other events that we don't handle
                break;
        }
    } catch (err) {
        if (err instanceof Error) {
            console.error(err.message);
            return NextResponse.json({ message: err.message }, { status: 400 });
        }
    }
    return NextResponse.json({ received: true });
}
