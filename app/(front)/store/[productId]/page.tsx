import UserLoginForm from '@/components/auth/UserLoginForm'
import UserSignupForm from '@/components/auth/UserSignupForm'
import CheckoutForm from '@/components/checkout/CheckoutForm'
import CheckoutStripeWrapper from '@/components/checkout/CheckoutStripeWrapper'
import ImageContainer from '@/components/store/product/ImageContainer'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createClient } from '@/utils/supabase/server'

export default async function ProductIdPage({
    params,
}: {
    params: { productId: string }
}) {
    const supabase = createClient()

    const data = await supabase
        .from('products')
        .select('*')
        .eq('product_id', params.productId)
        .single()

    if (data.error != null) throw new Error(data.error.message)

    const product = data.data

    const userData = await supabase.auth.getUser()

    return (
        <div className="w-full max-w-6xl mx-auto px-4 md:px-6 py-12 md:py-20">
            <div className="grid md:grid-cols-2 gap-10 md:gap-16">
                <div className="flex flex-col gap-6">
                    <div>
                        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                            {product?.name}
                        </h1>
                        <p className="text-gray-500 dark:text-gray-400 mt-2 text-lg md:text-xl">
                            {product?.description}
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-4xl font-bold">
                            {product?.price} $
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
                        <CheckoutStripeWrapper
                            productId={params.productId}
                        >
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
                                        redirect={`/store/${params.productId}`}
                                    />
                                </TabsContent>
                                <TabsContent value="signup">
                                    <UserSignupForm
                                        redirect={`/store/${params.productId}`}
                                    />
                                </TabsContent>
                            </Tabs>
                        </div>
                    )}
                </div>
                <div className="grid gap-6">
                    <ImageContainer
                        alt="Course Image"
                        height={600}
                        src={product.image}
                        width={800}
                        className="rounded-lg w-full"
                    />
                </div>
            </div>
            {/* <div className="mt-12 md:mt-20">
                <h2 className="text-2xl md:text-3xl font-bold">
                    What Our Customers Say
                </h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
                    <ReviewCard
                        avatarSrc="/img/placeholder.svg"
                        name="Jane Doe"
                        title="CEO, Acme Inc."
                        children={
                            '"The LMS Pro Plan has been a game-changer [...] and productivity."'
                        }
                    />
                    <ReviewCard
                        avatarSrc="/img/placeholder.svg"
                        name="John Smith"
                        title="CTO, Acme Inc."
                        children={
                            '"I\'ve been using the LMS Pro Plan for over a year [...] user-friendly."'
                        }
                    />
                </div>
            </div>
            <div className="mt-12 md:mt-20">
                <h2 className="text-2xl md:text-3xl font-bold">
                    Our Course Library
                </h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
                    <CourseCard
                        courseImage="/img/placeholder.svg"
                        courseName="Web Development"
                        lessonsCount="120 lessons"
                        description="Learn the latest web development technologies and frameworks."
                    />
                    <CourseCard
                        courseImage="/img/placeholder.svg"
                        courseName="Data Science"
                        lessonsCount="80 lessons"
                        description="Dive into the world of data analysis and machine learning."
                    />
                    <CourseCard
                        courseImage="/img/placeholder.svg"
                        courseName="Project Management"
                        lessonsCount="90 lessons"
                        description="Develop the skills to lead successful projects and teams."
                    />
                </div>
            </div> */}
        </div>
    )
}
