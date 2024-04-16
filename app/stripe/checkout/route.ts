import Stripe from 'stripe'
import { cookies } from 'next/headers'
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
    const cookieStore = cookies()
    const supabase = createClient(cookieStore)

    // Check if we have a session
    const {
        data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
        return new Response('Unauthorized', { status: 401 })
    }


    if (!productId) {
        return new Response('Missing product ID', { status: 400 })
    }

    const fullUser = await supabase.auth.getUser()

    if (!fullUser) {
        return new Response('Unauthorized', { status: 401 })
    }

    console.log(fullUser)

    const profile = await supabase
        .from('profiles')
        .select('*')
        .eq('id', fullUser?.data.user?.id)
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

        // const { total, currencySymbol, product } = await getProductData({
        //     payload,
        //     productId,
        // })

        const productData = await supabase.from('products').select(`*, products_pricing ( id, price, currency ( code, id ) )`).eq('id', productId).single()

        console.log(productData, '<----------- productData')

        // console.log(total, '<----------- total')


        const invoice = await supabase.from('invoices').insert({
            customer_id: fullUser?.data.user?.id,
            status: 'pending',
            country: 'US',
            currency: productData.data?.products_pricing[0].currency?.id,
            due_date: dayjs().add(1, 'week').toDate(),
        }).select('*').single()

        console.log(invoice, '<----------- invoice')

        const invoiceLineItem = await supabase.from('invoice_line_items').insert({
            invoice_id: invoice.data?.id,
            product_id: productId,
            quantity: 1,
            line_amount: productData.data?.products_pricing[0].price,
        }).single()

        console.log(invoiceLineItem, '<----------- invoiceLineItem')

        const session = await stripe.checkout.sessions.create({
            line_items: [
                {
                    price_data: {
                        currency: productData.data?.products_pricing[0].currency?.code,
                        product_data: {
                            name: productData.data?.name as string,
                            description: productData.data?.description as string,
                        },
                        unit_amount: productData.data?.products_pricing[0].price * 100,
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
                invoiceId: invoice.data?.id as number,
            },
        });

        // add payment method to user
        // const paymentMethod = await payload.create<'payment-methods'>({
        //     collection: 'payment-methods',
        //     data: {
        //         title: 'Stripe card',
        //         paymentMethodType: 'stripe',
        //         paymentsOfUser: typeof user === 'string' ? user : user?.id,
        //         default: true,
        //     },
        // })

        console.log(session, '<----------- session')

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
