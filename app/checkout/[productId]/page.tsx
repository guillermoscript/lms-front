import CheckoutCard from "@/components/checkout/CheckoutCard";
import { createClient } from "@/utils/supabase/server";
import { Currency } from "lucide-react";
import { cookies } from "next/headers";

export default async function CheckoutPage({ params }: { params: { productId: string } }) {

    const cookieStore = cookies()
    const supabase = createClient(cookieStore)

    const {data} = await supabase.from('products').select(`*, products_pricing ( id, price, currency ( code ) )`).eq('id', params.productId).single()

    const isSubscription = data?.is_subscription

    console.log(isSubscription)
    console.log(data)

    return (
        <div className="flex flex-col gap-10 w-full">
			<div className="container mx-auto px-6">
				<h3 className="text-gray-700 text-2xl font-medium">Checkout</h3>
				<p>
					Checkout for {data?.name} for{" "}
					{data?.products_pricing[0]?.price}{" "}
					{data?.products_pricing[0]?.currency?.code}
				</p>
				<div className="flex flex-col justify-between gap-4 lg:flex-row mt-8">
					<CheckoutCard 
                        productId={data?.id}
                    />

					<div className="w-full mb-8 flex-shrink-0 order-1 lg:w-1/2 lg:mb-0 lg:order-2">
						{isSubscription && <ProductSection product={data} />}
					</div>
				</div>
			</div>
			<footer className=" rounded-lg shadow sm:flex sm:items-center sm:justify-between p-4 sm:p-6 xl:p-8  antialiased">
				<p className="mb-4 text-sm text-center  sm:mb-0">
					&copy; 2019-2022{" "}
					<a
						href="https://flowbite.com/"
						className="hover:underline"
						target="_blank"
					>
						summaryapp.com
					</a>
					. All rights reserved.
				</p>
				<div className="flex justify-center items-center space-x-1">
					<a
						href="#"
						data-tooltip-target="tooltip-facebook"
						className="inline-flex justify-center p-2 ">
						<svg
							className="w-4 h-4"
							aria-hidden="true"
							xmlns="http://www.w3.org/2000/svg"
							fill="currentColor"
							viewBox="0 0 8 19"
						>
							<path
								fill-rule="evenodd"
								d="M6.135 3H8V0H6.135a4.147 4.147 0 0 0-4.142 4.142V6H0v3h2v9.938h3V9h2.021l.592-3H5V3.591A.6.6 0 0 1 5.592 3h.543Z"
								clip-rule="evenodd"
							/>
						</svg>
						<span className="sr-only">Facebook</span>
					</a>
				</div>
			</footer>
			</div>
    )
}

async function ProductSection({ product }: { product: any }) {
    const cookieStore = cookies()
    const supabase = createClient(cookieStore)

    const {data} = await supabase.from('plans').select(`*, products (
        *,
        products_pricing ( id, price, currency ( code ) )
    )`).eq('id', product.id).single()

	console.log(data)

	return (
		<section className="flex flex-col items-center justify-center w-full">
			<div className="group my-10 flex w-full max-w-lg flex-col  rounded-lg border bg-base-300 shadow-md border-base-200 hover:shadow-xl transition-shadow duration-200 ease-in-out">
				<a
					className="relative mx-3 mt-3 flex h-60 rounded-xl"
					href="#"
				>
					<img
						className="peer absolute top-0 right-0 h-full w-full object-cover"
						src='https://tailwindui.com/img/ecommerce-images/product-page-02-featured-product-shot.jpg'
						alt="product image"
					/>
				</a>
				<div className="mt-4 px-5 pb-5">
					<a href="#">
						<h5 className="text-xl tracking-tight ">
							{product.name}
						</h5>
					</a>
					{/* <div className="mt-2 mb-5 flex items-center justify-between">
						<p>
							<span className="text-3xl font-bold ">
								{symbol}
								{price}/
								<span className="text-base">
									{plan.periodicity}
								</span>
							</span>
						</p>
						<p>
							{product.description}
						</p>
					</div> */}
				</div>
			</div>
		</section>
	);
}