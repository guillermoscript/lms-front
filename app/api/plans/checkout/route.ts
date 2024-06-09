import { type NextRequest } from 'next/server'
import Stripe from 'stripe'

import { createClient } from '@/utils/supabase/server'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '')

export async function POST (req: NextRequest) {
    const body = await req.json() // res now contains body

    console.log(body, '<----------- body')

    const { planId } = body

    console.log(body, '<----------- body')

    if (!stripe) {
        return new Response('Internal server error', { status: 500 })
    }

    if (!planId) {
        return new Response('Missing plan ID', { status: 400 })
    }

    const supabase = createClient()

    const fullUser = await supabase.auth.getUser()

    if (!fullUser) {
        return new Response('Unauthorized', { status: 401 })
    }

    console.log(fullUser)

    const profile = await supabase
        .from('profiles')
        .select('*')
        .eq('id', fullUser?.data?.user?.id)
        .single()

    try {
        let stripeCustomerID = profile.data?.stripeCustomerID

        // // lookup user in Stripe and create one if not found
        if (!stripeCustomerID) {
            const customer = await stripe.customers.create({
                email: fullUser?.data.user?.email,
                name: profile.data?.full_name
            })

            console.log(customer, '<----------- customer')

            stripeCustomerID = customer.id

            console.log(stripeCustomerID)

            // add stripe customer id to user
            const update = await supabase
                .from('profiles')
                .update({ stripeCustomerID })
                .match({ id: fullUser?.data.user?.id })

            console.log(update, '<----------- update')
        }

        const planData = await supabase
            .from('plans')
            .select('*')
            .eq('plan_id', planId)
            .single()

        console.log(planData, '<----------- planData')

        const transaction = await supabase
            .from('transactions')
            .insert({
                amount: planData?.data?.price,
                user_id: fullUser?.data.user?.id as any,
                currency: 'usd',
                status: 'pending',
                plan_id: planId
            })
            .select('*')
            .single()

        console.log(transaction, '<----------- transaction')

        console.log(transaction, '<----------- invoice')

        const session = await stripe.checkout.sessions.create({
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: planData.data?.plan_name,
                            description: planData.data?.description
                        },
                        unit_amount: planData?.data?.price * 100
                    },
                    quantity: 1
                }
            ],
            customer: profile.data?.stripeCustomerID || stripeCustomerID,
            payment_intent_data: {
                setup_future_usage: 'off_session'
            },
            mode: 'payment',
            success_url: `${process.env.NEXT_PUBLIC_DOMAIN_URL}/checkout/success`,
            cancel_url: `${process.env.NEXT_PUBLIC_DOMAIN_URL}/checkout/cancel`,
            metadata: {
                planId,
                invoiceId: transaction.data?.transaction_id
            }
        })

        return new Response(
            JSON.stringify({
                id: session.id,
                url: session.url
            }),
            {
                headers: {
                    'Content-Type': 'application/json'
                },
                status: 201
            }
        )
    } catch (error) {
        console.log(error, '<----------- error')
        return new Response('Internal server error', { status: 500 })
    }
}
