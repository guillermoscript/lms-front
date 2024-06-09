
import CheckoutProduct from '@/components/store/CheckoutProduct'
import CourseCard from '@/components/store/product/CourseCard'
import ImageContainer from '@/components/store/product/ImageContainer'
import ReviewCard from '@/components/store/product/ReviewCard'
import { createClient } from '@/utils/supabase/server'

export default async function ProductIdPage ({
    params
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
                    {/*
						<ul className="grid gap-2">
							<li className="flex items-center gap-2">
								<CheckIcon className="h-5 w-5 text-primary" />
								<span>Unlimited access to all courses</span>
							</li>
						</ul>
					 */}
                    <CheckoutProduct
                        params={params}
                    />
                </div>
                <div className="grid gap-6">
                    <ImageContainer
                        alt="Course Image"
                        className="rounded-lg overflow-hidden"
                        height={600}
                        src="/img/placeholder.svg"
                        width={800}
                    />
                    <div className="grid md:grid-cols-2 gap-6">
                        <ImageContainer
                            alt="Course Image"
                            className="rounded-lg"
                            height={300}
                            src="/img/placeholder.svg"
                            width={400}
                        />
                        <ImageContainer
                            alt="Course Image"
                            className="rounded-lg"
                            height={300}
                            src="/img/placeholder.svg"
                            width={400}
                        />
                    </div>
                </div>
            </div>
            <div className="mt-12 md:mt-20">
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
                    {/* more review cards */}
                </div>
            </div>
            <div className="mt-12 md:mt-20">
                <h2 className="text-2xl md:text-3xl font-bold">
                  Our Course Library
                </h2>
                {/* TODO: AKI PONER LOS CURSOS */}
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
                    {/* more course cards */}
                </div>
            </div>
        </div>
    )
}
