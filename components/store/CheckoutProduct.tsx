'use client'

import { useState } from 'react'

import CheckoutCard from '../checkout/CheckoutCard'

export default function CheckoutProduct ({
    params
}) {
    const [error, setError] = useState<string | null>(null)

    return (
        <div className='flex flex-col gap-4'>
            <CheckoutCard
                callback={async (data) => {
                    if (data.radio === 'card') {
                        try {
                            const data = await fetch(
                                '/stripe/checkout',
                                {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type':
                                        'application/json'
                                    },
                                    body: JSON.stringify({
                                        productId: params.productId
                                    })
                                }
                            )
                            const response = await data.json()
                            console.log(response)
                            window.location.href = response.url
                        } catch (error) {
                            console.log(error)
                            setError('An error occurred')
                        }
                    } else if (data.radio === 'binance') {
                        console.log('binance')
                    } else if (data.radio === 'paypal') {
                        console.log('paypal')
                    }
                }}
            />
            {error && (
                <div className='bg-red-500 text-white p-4'>
                    {error}
                </div>
            )}
        </div>
    )
}
