'use client'

import { useState } from 'react'

import CheckoutCard from '../checkout/CheckoutCard'

export default function CheckoutPlan ({
    params
}) {
    const [error, setError] = useState<string | null>(null)

    return (
        <div className='flex flex-col gap-4'>
            <CheckoutCard
                callback={async (data) => {
                    console.log(data)
                    try {
                        const data = await fetch(
                            '/api/plans/checkout',
                            {
                                method: 'POST',
                                headers: {
                                    'Content-Type':
                                                  'application/json'
                                },
                                body: JSON.stringify({
                                    planId: params.planId
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
