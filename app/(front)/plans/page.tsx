import PriceCard from '@/components/plans/PriceCard'
import { createClient } from '@/utils/supabase/server'

export default async function PlanPage() {
    const supabase = createClient()

    const plans = await supabase.from('plans').select('*')

    if (plans.error != null) {
        console.log(plans.error)
        throw plans.error
    }

    const [month, quarterly, yearly] = plans.data

    const basicData = [
        {
            title: 'Hobby',
            price: month.price,
            description: 'Best for developers trying to use the platform.',
            features: [
                { text: '5 API requests per day' },
                { text: 'Access to basic API endpoints' },
                { text: 'Email support within 48 hours' },
                { text: 'Community forum access' },
                { text: 'Monthly newsletter' },
            ],
            buttonText: 'Buy Now',
            isHighlighted: false,
            periodicity: 'month',
            id: month.plan_id,
        },
        {
            title: 'Starter',
            price: quarterly.price,
            description: 'Perfect for small businesses',
            features: [
                { text: 'Everything in Hobby, plus' },
                { text: '50 API requests per day' },
                { text: 'Access to advanced API endpoints' },
                { text: 'Email support within 24 hours' },
                { text: 'Community forum access' },
                { text: 'Self hosting options' },
            ],
            buttonText: 'Buy Now',
            isHighlighted: false,
            periodicity: 'quarter',
            id: quarterly.plan_id,
        },
        {
            title: 'Professional',
            price: yearly.price,
            description: 'Ideal for small to mid range startups',
            features: [
                { text: 'Everything in Starter, plus' },
                { text: '500 API requests per day' },
                { text: 'Access to super advanced API endpoints' },
                { text: 'Email support within 12 hours' },
                { text: 'Private Community access' },
                { text: 'Monthly retreats' },
                { text: 'Self hosting options' },
                { text: 'Private infrastructure' },
                { text: 'On-Prem deployments' },
            ],
            buttonText: 'Buy Now',
            isHighlighted: true,
            periodicity: 'year',
            id: yearly.plan_id,
        },
    ]

    return (
        <section className="w-full py-12 md:py-24 lg:py-20 container ">
            <div className="relative z-20 py-10 md:pt-15">
                <h1 className="max-w-5xl mx-auto text-center tracking-tight font-medium text-black dark:text-white text-3xl md:text-5xl md:leading-tight">
                    <span
                        data-br=":ru9:"
                        data-brr={1}
                        style={{
                            display: 'inline-block',
                            verticalAlign: 'top',
                            textDecoration: 'inherit',
                            textWrap: 'balance',
                        }}
                    >
                        Simple pricing for your ease
                    </span>
                </h1>
                <h2 className="text-sm md:text-base max-w-4xl my-4 mx-auto  font-normal text-center">
                    <span
                        data-br=":rua:"
                        data-brr={1}
                        style={{
                            display: 'inline-block',
                            verticalAlign: 'top',
                            textDecoration: 'inherit',
                            textWrap: 'balance',
                        }}
                    >
                        Every AI offers a wide range of services. You can choose
                        the one that suits your needs. Select from your
                        favourite plan and get started instantly.
                    </span>
                </h2>
            </div>
            <div className="mx-auto flex flex-col gap-6 sm:flex-row sm:justify-center sm:gap-6">
                {basicData.map((data) => {
                    return (
                        <PriceCard
                            title={data.title}
                            price={data.price}
                            description={data.description}
                            features={data.features}
                            buttonText={data.buttonText}
                            isHighlighted={data.isHighlighted}
                            periodicity={data.periodicity}
                            key={data.id}
                            id={data.id}
                        />
                    )
                })}
            </div>
            {/* <div className="container px-4 md:px-6 flex flex-col gap-4 md:gap-8">
                <div className="space-y-6 text-center">
                    <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
                        Pricing Plans
                    </h2>
                    <p className="mx-auto max-w-[700px] text-gray-500 md:text-xl/relaxed dark:text-gray-400">
                        Choose the plan that fits your needs and budget. All
                        plans come with a 30-day money-back guarantee.
                    </p>
                </div>

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
            </div> */}
        </section>
    )
}
