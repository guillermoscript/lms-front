import PlanCard from '@/components/plans/PlanCards'
import { createClient } from '@/utils/supabase/server'

export default async function PlanPage () {
    const supabase = createClient()

    const plans = await supabase.from('plans').select('*')

    if (plans.error != null) {
        console.log(plans.error)
        throw plans.error
    }

    console.log(plans)

    const [month, yearly, quarterly] = plans.data

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
                {/* <div className="mx-auto grid max-w-5xl grid-cols-1 items-start gap-6 sm:grid-cols-3"> */}
                <div className="mx-auto flex flex-col gap-6 sm:flex-row sm:justify-center sm:gap-6">
                    <PlanCard
                        title={month.plan_name}
                        description={month.description}
                        features={month.features}
                        price={month.price}
                        buttonVariant="secondary"
                        planId={month.plan_id}
                    />
                    <PlanCard
                        title={yearly.plan_name}
                        description={yearly.description}
                        features={yearly.features}
                        price={yearly.price}
                        oldPrice={400}
                        isPopular
                        buttonVariant="default"
                        planId={quarterly.plan_id}
                    />
                    <PlanCard
                        title={quarterly.plan_name}
                        description={quarterly.description}
                        features={quarterly.features}
                        price={quarterly.price}
                        buttonVariant="secondary"
                    />
                </div>
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
