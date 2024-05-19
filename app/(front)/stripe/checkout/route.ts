import Stripe from 'stripe'
import { type NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import dayjs from 'dayjs'


const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '')


export async function POST(req: NextRequest) {
    const body = await req.json() // res now contains body

    console.log(body, '<----------- body')

    const { productId } = body

    console.log(body, '<----------- body')

    if (!stripe) {        
        return new Response('Internal server error', { status: 500 })
    }

    if (!productId) {
        return new Response('Missing product ID', { status: 400 })
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
                name: profile.data?.full_name as string,
            })

            console.log(customer, '<----------- customer')

            stripeCustomerID = customer.id

            console.log(stripeCustomerID)

            // add stripe customer id to user
            const update = await supabase
                .from('profiles')
                .update({ stripeCustomerID: stripeCustomerID })
                .match({ id: fullUser?.data.user?.id })

                console.log(update, '<----------- update')
        }

        const productData = await supabase.from('products').select(`*`).eq('product_id', productId).single()

        console.log(productData, '<----------- productData')

        const transaction = await supabase.from('transactions').insert({
            user_id: fullUser?.data.user?.id as any, 
            status: 'pending',
            currency: 'usd', // Add the 'currency' property
            product_id: productId,
            due_date: dayjs().add(1, 'week').toDate(),
        }).select('*').single()

        console.log(transaction, '<----------- invoice')

        
        const session = await stripe.checkout.sessions.create({
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: productData.data?.name as string,
                            description: productData.data?.description as string,
                        },
                        unit_amount: productData?.data?.price * 100,
                    },
                    quantity: 1,
                },
            ],
            customer: profile.data?.stripeCustomerID || stripeCustomerID,
            payment_intent_data: {
                setup_future_usage: 'off_session',
            },
            mode: 'payment',
            success_url: `${process.env.NEXT_PUBLIC_DOMAIN_URL}/checkout/success`,
            cancel_url: `${process.env.NEXT_PUBLIC_DOMAIN_URL}/checkout/cancel`,
            metadata: {
                productId: productId,
                invoiceId: transaction.data?.transaction_id as number,
            },
        });

        return new Response(JSON.stringify({ 
            id: session.id,
            url: session.url
        }), {
            headers: {
                'Content-Type': 'application/json',
            },
            status: 201,
        })
    } catch (error) {
        console.log(error, '<----------- error')
        return new Response('Internal server error', { status: 500 })
    }
}
