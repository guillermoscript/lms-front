import UserLoginForm from '@/components/auth/UserLoginForm'
import UserSignupForm from '@/components/auth/UserSignupForm'
import CheckoutForm from '@/components/checkout/CheckoutForm'
import CheckoutImages from '@/components/checkout/CheckoutImages'
import CheckoutStripeWrapper from '@/components/checkout/CheckoutStripeWrapper'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createClient } from '@/utils/supabase/server'

export default async function PlansCheckoutPage({
    params,
}: {
    params: { planId: string }
}) {
    const supabase = createClient()

    const { data } = await supabase
        .from('plans')
        .select('*')
        .eq('plan_id', params.planId)
        .single()

    const userData = await supabase.auth.getUser()

    return (
        <div className="container px-4 md:px-6 flex flex-col gap-4 md:gap-8 py-12 md:py-24 lg:py-32">
            <div className="grid md:grid-cols-2 gap-10 md:gap-16 w-full">
                <div className="flex flex-col gap-6">
                    <div>
                        <div className="inline-block rounded-lg bg-gray-100 px-3 py-1 text-sm font-medium dark:bg-gray-800">
                            {data?.plan_name}
                        </div>
                        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                            Checkout
                        </h1>
                        <p className="text-gray-500 dark:text-gray-400 mt-2 text-lg md:text-xl">
                            Complete your purchase for the {data?.plan_name}{' '}
                            Plan.
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-4xl font-bold">
                            {data?.price} $
                        </div>
                        <div className="text-gray-500 dark:text-gray-400 text-lg">
                            /month
                        </div>
                    </div>
                    <div>
                        <p className="text-gray-500 dark:text-gray-400">
                            For now this is a test payment, you can use the
                            following card details:
                        </p>
                        <ul className="list-disc list-inside">
                            <li
                                className='text-gray-500 dark:text-gray-400'
                            >4242 4242 4242 4242</li>
                            <li
                                className='text-gray-500 dark:text-gray-400'
                            >Any future date</li>
                            <li
                                className='text-gray-500 dark:text-gray-400'
                            >Any CVC</li>
                        </ul>
                    </div>
                    {userData.data.user ? (
                        <CheckoutStripeWrapper planId={params.planId}>
                            <CheckoutForm />
                        </CheckoutStripeWrapper>
                    ) : (
                        <div className="flex flex-col gap-4">
                            <Tabs
                                defaultValue="login"
                                className="w-full px-8 sm:max-w-md"
                            >
                                <TabsList className="h-12 p-3">
                                    <TabsTrigger className="p-2" value="login">
                                        Login to continue
                                    </TabsTrigger>
                                    <TabsTrigger className="p-2" value="signup">
                                        Create an account
                                    </TabsTrigger>
                                </TabsList>
                                <TabsContent value="login">
                                    <UserLoginForm
                                        redirect={`/plans/${params.planId}`}
                                    />
                                </TabsContent>
                                <TabsContent value="signup">
                                    <UserSignupForm
                                        redirect={`/plans/${params.planId}`}
                                    />
                                </TabsContent>
                            </Tabs>
                        </div>
                    )}
                </div>
                <CheckoutImages
                    img1src={data?.thumbnail}
                    img2src="/img/placeholder.svg"
                    img3src="/img/placeholder.svg"
                />
            </div>
        </div>
    )
}
