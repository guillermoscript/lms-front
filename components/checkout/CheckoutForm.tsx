'use client'
import {
    PaymentElement,
    useElements,
    useStripe
} from '@stripe/react-stripe-js'
import { Loader } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '../ui/button'

export default function CheckoutForm() {
    const stripe = useStripe()
    const elements = useElements()

    const [message, setMessage] = useState(null)
    const [isLoading, setIsLoading] = useState(false)

    useEffect(() => {
        if (!stripe) {
            return
        }

        const clientSecret = new URLSearchParams(window.location.search).get(
            'payment_intent_client_secret'
        )

        if (!clientSecret) {
            return
        }

        stripe.retrievePaymentIntent(clientSecret).then(({ paymentIntent }) => {
            switch (paymentIntent.status) {
                case 'succeeded':
                    setMessage('Payment succeeded!')
                    break
                case 'processing':
                    setMessage('Your payment is processing.')
                    break
                case 'requires_payment_method':
                    setMessage('Your payment was not successful, please try again.')
                    break
                default:
                    setMessage('Something went wrong.')
                    break
            }
        })
    }, [stripe])

    const handleSubmit = async (e) => {
        e.preventDefault()

        if (!stripe || !elements) {
            // Stripe.js hasn't yet loaded.
            // Make sure to disable form submission until Stripe.js has loaded.
            return
        }

        setIsLoading(true)

        const { error } = await stripe.confirmPayment({
            elements,
            confirmParams: {
                // Make sure to change this to your payment completion page
                return_url: `${process.env.NEXT_PUBLIC_DOMAIN_URL}/checkout/success`,
            },
        })

        // This point will only be reached if there is an immediate error when
        // confirming the payment. Otherwise, your customer will be redirected to
        // your `return_url`. For some payment methods like iDEAL, your customer will
        // be redirected to an intermediate site first to authorize the payment, then
        // redirected to the `return_url`.
        if (error.type === 'card_error' || error.type === 'validation_error') {
            setMessage(error.message)
        } else {
            setMessage('An unexpected error occurred.')
        }

        setIsLoading(false)
    }

    const paymentElementOptions = {
        layout: 'tabs',
    }

    return (
        <form
            className='p-4 rounded-lg shadow-lg bg-primary-foreground flex flex-col gap-4'
            id="payment-form" onSubmit={handleSubmit}
        >

            <PaymentElement
                id="payment-element"
                // @ts-expect-error
                options={paymentElementOptions}
            />
            <Button disabled={isLoading || !stripe || !elements} id="submit">
                <span id="button-text">
                    {isLoading ? <Loader className="animate-spin" /> : 'Pay'}
                </span>
            </Button>
            {/* Show any error or success messages */}
            {message && <div id="payment-message">{message}</div>}
        </form>
    )
}
