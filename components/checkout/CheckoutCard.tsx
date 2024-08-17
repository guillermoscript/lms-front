// @ts-nocheck
'use client'

import { useForm } from 'react-hook-form'

import { Button } from '../ui/button'
import {
    Form
} from '../ui/form'

interface formValues {
    radio: 'binance' | 'paypal' | 'card'
}

interface CheckoutCardProps {
    callback: (data: formValues) => void
}

export default function CheckoutCard ({ callback }: CheckoutCardProps) {
    const form = useForm<formValues>()

    async function onSubmit (data: formValues) {
        try {
            await callback(data)
        } catch (error) {
            console.log(error)
        }
    }

    return (
        <>
            <Form {...form}>
                <form
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="w-full space-y-6"
                >
                    <input
                        {
                            ...form.register('radio')
                        }
                        type='hidden' name='card' value='card'
                    />
                    <Button
                        className="w-full"
                        type="submit"
                        disabled={form.formState.isSubmitting}
                    >
            Pay with Card
                    </Button>
                </form>
            </Form>
        </>
    )
}
