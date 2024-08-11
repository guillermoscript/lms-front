'use client'
import { Elements } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { useEffect, useState } from 'react'

import ChatLoadingSkeleton from '../dashboards/chat/ChatLoadingSkeleton'

// Make sure to call loadStripe outside of a component’s render to avoid
// recreating the Stripe object on every render.
// This is your test publishable API key.
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)

export default function CheckoutStripeWrapper({
    children,
    planId,
    productId
}: {
    children: React.ReactNode
    planId?: string
    productId?: string
}) {
    const [clientSecret, setClientSecret] = useState('')
    const [isLoading, setIsLoading] = useState(false)

    useEffect(() => {
    // Create PaymentIntent as soon as the page loads
        setIsLoading(true)
        fetch('/api/stripe/create-payment-intent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                planId,
                productId
            }),
        })
            .then(async (res) => await res.json())
            .then((data) => setClientSecret(data.clientSecret))
            .catch((err) => console.log(err))
            .finally(() => setIsLoading(false))
    }, [])

    const appearance = {
        theme: 'stripe',
        variables: {
            colorBackground: '#F6F8FA',
            accessibleColorOnColorPrimary: '#6d28d9'
        },
        rules: {

            '.Label': {
                fontWeight: '500'
            }
        }
    }

    const options = {
        clientSecret,
        appearance,
    }

    return (
        <div className="App">
            {
                isLoading ? (
                    <ChatLoadingSkeleton />
                ) : (

                    clientSecret && (
                        // @ts-expect-error
                        <Elements options={options} stripe={stripePromise}>
                            {children}
                        </Elements>
                    )
                )
            }
        </div>
    )
}
