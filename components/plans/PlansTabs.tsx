'use client'
import { CheckCircle } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tables } from '@/utils/supabase/supabase'

import { buttonVariants } from '../ui/button'

function SubscriptionPlan({ plans }: { plans: Array<Tables<'plans'>> }) {
    const [selectedPeriodicity, setSelectedPeriodicity] = useState('monthly')

    const getPlanPrice = (plan) => {
        if (selectedPeriodicity === 'monthly') {
            return plan.duration_in_days === 30 ? `$${plan.price}` : null
        }
        if (selectedPeriodicity === 'quarterly') {
            return plan.duration_in_days === 90 ? `$${plan.price}` : null
        }
        if (selectedPeriodicity === 'yearly') {
            return plan.duration_in_days === 365 ? `$${plan.price}` : null
        }
        return null
    }

    const filteredPlans = plans.filter((plan) => getPlanPrice(plan) !== null)

    return (
        <div className="w-full container">
            <Tabs
                value={selectedPeriodicity}
                onValueChange={setSelectedPeriodicity}
                defaultValue="monthly" className="w-full"
            >
                <TabsList className="flex justify-center w-fit mx-auto mb-6">
                    <TabsTrigger
                        value="monthly"
                        className="px-4 py-2"
                    >
                        Monthly
                    </TabsTrigger>
                    <TabsTrigger
                        value="quarterly"
                        className="px-4 py-2"
                    >
                        Quarterly
                    </TabsTrigger>
                    <TabsTrigger
                        value="yearly"
                        className="px-4 py-2"
                    >
                        Yearly
                    </TabsTrigger>
                </TabsList>
                <div className="flex flex-col items-center justify-center mt-16 space-y-8 lg:flex-row lg:items-stretch lg:space-x-8 lg:space-y-0">
                    {filteredPlans.map((plan) => (
                        <section
                            key={plan.plan_id}
                            className={`flex flex-col w-full max-w-sm p-12 space-y-6 bg-card border rounded-lg shadow-md ${
                                plan.plan_name.includes('Premium')
                                    ? 'border-2 border-indigo-600'
                                    : ''
                            }`}
                        >
                            <div className="flex-shrink-0">
                                <span
                                    className={`text-4xl font-medium tracking-tight ${
                                        plan.plan_name.includes('Basic')
                                            ? 'text-green-500'
                                            : ''
                                    }`}
                                >{`$${plan.price}`}</span>
                                <span className="text-gray-400">
                                    {selectedPeriodicity === 'monthly'
                                        ? '/month'
                                        : selectedPeriodicity === 'quarterly'
                                            ? '/quarter'
                                            : '/year'}
                                </span>
                            </div>
                            <div className="flex-shrink-0 pb-6 space-y-2 border-b">
                                <h2 className="text-2xl font-normal">
                                    {plan.plan_name}
                                </h2>
                                <p className="text-sm text-gray-400">
                                    {plan.description}
                                </p>
                            </div>
                            <ul className="flex-1 flex flex-col gap-4">
                                {plan.features
                                    .split(';')
                                    .map((feature, index) => (
                                        <li
                                            key={index}
                                            className="flex items-center gap-4"
                                        >
                                            <CheckCircle className="w-5 h-5 text-green-500" />
                                            <span className="text-base font-medium w-fit text-wrap">
                                                {feature}
                                            </span>
                                        </li>
                                    ))}
                            </ul>
                            <div className="flex-shrink-0 pt-4">
                                <Link
                                    href={`/plans/${plan.plan_id}`}
                                    className={buttonVariants({ variant: 'default' })}
                                >{`Get ${plan.plan_name}`}</Link>
                            </div>
                        </section>
                    ))}
                </div>
            </Tabs>
        </div>
    )
}

export default SubscriptionPlan
