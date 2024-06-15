
import dayjs from 'dayjs'
import { CheckIcon } from 'lucide-react'

import { createClient } from '@/utils/supabase/server'

export default async function SubscriptionsPage () {
    const supabase = createClient()

    const subscriptions = await supabase
        .from('subscriptions')
        .select('*, plans(*)')
        .single()

    if (subscriptions.error != null) {
        throw new Error('Error fetching subscriptions')
    }

    return (
        <div className='flex flex-col gap-8'>
            <h1 className="text-2xl font-bold">Subscriptions</h1>
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-950 hover:scale-105 transition-transform duration-300 ease-in-out">
                <div className="space-y-4">
                    <h3 className="text-2xl font-bold">
                        {subscriptions.data.plans?.plan_name}
                    </h3>
                    <p className="text-gray-500 dark:text-gray-400">
                        {subscriptions.data.plans?.description}
                    </p>
                    <p>
                        Days left: {dayjs(subscriptions.data.end_date).diff(dayjs(), 'days')}
                    </p>
                    <ul className="space-y-2 text-sm">
                        <li className="flex items-center">
                            <CheckIcon className="mr-2 h-4 w-4 fill-primary animate-bounce" />
                    Unlimited users
                        </li>
                        <li className="flex items-center">
                            <CheckIcon className="mr-2 h-4 w-4 fill-primary animate-bounce" />
                    Unlimited storage
                        </li>
                        <li className="flex items-center">
                            <CheckIcon className="mr-2 h-4 w-4 fill-primary animate-bounce" />
                    Enterprise features
                        </li>
                    </ul>
                    <div className="flex items-center justify-between">
                        <span className="text-4xl font-bold text-primary">
                            {subscriptions.data.plans?.price}
                        </span>

                    </div>
                </div>
            </div>
        </div>
    )
}
