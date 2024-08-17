import SubscriptionPlan from '@/components/plans/PlansTabs'
import { createClient } from '@/utils/supabase/server'

export default async function PlanPage () {
    const supabase = createClient()
    const userData = await supabase.auth.getUser()

    const plans = await supabase.from('plans').select('*').is('deleted_at', null)

    const subscriptions = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userData.data.user.id).single()

    if (plans.error != null) {
        console.log(plans.error)
        throw plans.error
    }

    return (
        <section className="w-full py-12 md:py-24 lg:py-32 ">
            <div className="container px-4 md:px-6 flex flex-col gap-4 md:gap-8">
                <div className="space-y-6 text-center">
                    <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
                        Pricing Plans
                    </h2>
                    <p className="mx-auto max-w-[700px] text-gray-500 md:text-xl/relaxed dark:text-gray-400">
                        Choose the plan that fits your needs and budget. All
                        plans come with a 30-day money-back guarantee.
                    </p>
                </div>
                <SubscriptionPlan
                    userPlan={subscriptions?.data?.plan_id}
                    plans={plans.data}
                />
                <div className="mt-12 space-y-4 text-center">
                    <p className="text-gray-500 dark:text-gray-400">
                        All plans come with a 30-day money-back guarantee, 24/7
                        support, and a user-friendly dashboard to manage your
                        account.
                    </p>
                    <p className="text-gray-500 dark:text-gray-400">
                        Upgrade or downgrade your plan at any time, no long-term
                        contracts.
                    </p>
                    <p className="text-gray-500 dark:text-gray-400">
                        Get started today and experience the best-in-class
                        service and features.
                    </p>
                </div>
            </div>
        </section>
    )
}
