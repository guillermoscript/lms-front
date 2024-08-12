import BigNumber from 'bignumber.js'
import { type NextRequest } from 'next/server'
import Stripe from 'stripe'

import { createClient } from '@/utils/supabase/server'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '')

export async function POST (req: NextRequest) {
    const body = await req.json() // res now contains body

    console.log(body, '<----------- body')

    const { planId, productId } = body

    console.log(body, '<----------- body')

    if (!stripe) {
        return new Response('Internal server error', { status: 500 })
    }

    if (!planId && !productId) {
        return new Response('Missing plan ID', { status: 400 })
    }

    const supabase = createClient()

    const fullUser = await supabase.auth.getUser()

    console.log(fullUser)

    if (fullUser.error) {
        return new Response('Unauthorized', { status: 401 })
    }

    const profile = await supabase
        .from('profiles')
        .select('*')
        .eq('id', fullUser?.data?.user?.id)
        .single()

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

    if (planId) {
        const plan = await supabase
            .from('plans')
            .select('*')
            .eq('plan_id', planId)
            .single()

        const transaction = await supabase
            .from('transactions')
            .insert({
                amount: plan?.data?.price,
                user_id: fullUser?.data.user?.id as any,
                currency: 'usd',
                status: 'pending',
                plan_id: planId
            })
            .select('*')
            .single()

        console.log(transaction, '<----------- transaction')

        const price = new BigNumber(plan.data.price).multipliedBy(100).toNumber()

        console.log(price, '<----------- price')

        // Create a PaymentIntent with the order amount and currency
        const paymentIntent = await stripe.paymentIntents.create({
            amount: price,
            currency: 'usd',
            customer: stripeCustomerID,
            setup_future_usage: 'off_session',
            // In the latest version of the API, specifying the `automatic_payment_methods` parameter is optional because Stripe enables its functionality by default.
            automatic_payment_methods: {
                enabled: true,
            },
            metadata: {
                planId,
                invoiceId: transaction.data?.transaction_id
            }
        })

        return new Response(
            JSON.stringify({
                clientSecret: paymentIntent.client_secret,
            }),
            {
                headers: {
                    'Content-Type': 'application/json'
                },
                status: 201
            }
        )
    }

    if (productId) {
        const product = await supabase
            .from('products')
            .select('*')
            .eq('product_id', productId)
            .single()

        const transaction = await supabase
            .from('transactions')
            .insert({
                amount: product?.data.price,
                user_id: fullUser?.data.user?.id as any,
                currency: 'usd',
                status: 'pending',
                product_id: productId
            })
            .select('*')
            .single()

        const price = new BigNumber(product.data.price).multipliedBy(100).toNumber()

        // Create a PaymentIntent with the order amount and currency
        const paymentIntent = await stripe.paymentIntents.create({
            amount: price,
            customer: stripeCustomerID,
            setup_future_usage: 'off_session',
            currency: 'usd',
            // In the latest version of the API, specifying the `automatic_payment_methods` parameter is optional because Stripe enables its functionality by default.
            automatic_payment_methods: {
                enabled: true,
            },
            metadata: {
                productId,
                invoiceId: transaction.data?.transaction_id
            }
        })

        return new Response(
            JSON.stringify({
                clientSecret: paymentIntent.client_secret,
            }),
            {
                headers: {
                    'Content-Type': 'application/json'
                },
                status: 201
            }
        )
    }
}
