'use client'

import React from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '../ui/button'
import { Label } from '@radix-ui/react-dropdown-menu'
import { CreditCardIcon, BitcoinIcon } from 'lucide-react'
import { RadioGroup, RadioGroupItem } from '../ui/radio-group'
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage
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
      callback(data)
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
          <FormField
            control={form.control}
            name="radio"
            render={({ field }) => (
              <FormItem className="space-y-3">
                <FormLabel>Payment Methods</FormLabel>
                <FormControl>
                  <RadioGroup
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    className="flex gap-1 flex-col sm:flex-row sm:gap-4 w-full justify-around"
                  >
                    <div className="flex items-center space-x-2 w-1/3">
                      <RadioGroupItem
                        value="card"
                        id="r1"
                      />
                      <Label
                        className="flex items-center gap-1 "
                        htmlFor="r1"
                      >
                        <CreditCardIcon />
                        Stripe
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 w-1/3">
                      <RadioGroupItem
                        value="binance"
                        id="r2"
                      />
                      <Label
                        className="flex items-center gap-1 "
                        htmlFor="r2"
                      >
                        <BitcoinIcon />
                        Binance
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 w-1/3">
                      <RadioGroupItem
                        value="paypal"
                        id="r3"
                      />
                      <Label
                        className="flex items-center gap-1 "
                        htmlFor="r3"
                      >
                        {/* <Paypal /> */}
                        Paypal
                      </Label>
                    </div>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button
            className="w-full"
            type="submit"
          >
            Buy Now
          </Button>
        </form>
      </Form>
    </>
  )
}
