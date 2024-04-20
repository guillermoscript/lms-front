import CheckoutCard from "@/components/checkout/CheckoutCard";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/server";
import { Label } from "@radix-ui/react-dropdown-menu";
import { BitcoinIcon, CreditCardIcon, Currency } from "lucide-react";
import { cookies } from "next/headers";
import { Input } from "postcss";

export default async function CheckoutPage({
	params,
}: {
	params: { productId: string };
}) {
	const cookieStore = cookies();
	const supabase = createClient(cookieStore);

	const { data } = await supabase
		.from("products")
		.select(`*, products_pricing ( id, price, currency ( code ) )`)
		.eq("id", params.productId)
		.single();

	const planData = await supabase
		.from("plans")
		.select(
			`*, products (
        *,
        products_pricing ( id, price, currency ( code ) )
    )`
		)
		.eq("id", data?.id)
		.single();

	const isSubscription = data?.is_subscription;

	console.log(isSubscription);
	console.log(data);

	return (
		<>
			<div className="flex flex-col gap-6">
				<div>
					<div className="inline-block rounded-lg bg-gray-100 px-3 py-1 text-sm font-medium dark:bg-gray-800">
						{data?.name}
					</div>
					<h1 className="text-3xl md:text-4xl font-bold tracking-tight">
						Checkout
					</h1>
					<p className="text-gray-500 dark:text-gray-400 mt-2 text-lg md:text-xl">
						Complete your purchase for the LMS Pro Plan.
					</p>
				</div>
				<div className="flex items-center gap-4">
					<div className="text-4xl font-bold">
						{data?.products_pricing[0]?.price}{" "}
						{data?.products_pricing[0]?.currency?.code}
					</div>
					<div className="text-gray-500 dark:text-gray-400 text-lg">
						/month
					</div>
				</div>
				<CheckoutCard productId={data?.id} />
			</div>
			<div className="grid gap-6">
				<img
					alt="Course Image"
					className="rounded-lg overflow-hidden"
					height={600}
					src="/img/placeholder.svg"
					style={{
						aspectRatio: "800/600",
						objectFit: "cover",
					}}
					width={800}
				/>
				<div className="grid md:grid-cols-2 gap-6">
					<img
						alt="Course Image"
						className="rounded-lg overflow-hidden"
						height={300}
						src="/img/placeholder.svg"
						style={{
							aspectRatio: "400/300",
							objectFit: "cover",
						}}
						width={400}
					/>
					<img
						alt="Course Image"
						className="rounded-lg overflow-hidden"
						height={300}
						src="/img/placeholder.svg"
						style={{
							aspectRatio: "400/300",
							objectFit: "cover",
						}}
						width={400}
					/>
				</div>
			</div>
		</>
	);

	// return (
	//     <div className="flex flex-col gap-10 w-full">
	// 		<div className="container mx-auto px-6">
	// 			<h3 className="text-2xl font-medium">Checkout</h3>
	// 			<p>
	// 				Checkout for {data?.name} for{" "}
	// 				{data?.products_pricing[0]?.price}{" "}
	// 				{data?.products_pricing[0]?.currency?.code}
	// 			</p>
	// 			<div className="flex flex-col justify-between gap-4 lg:flex-row mt-8">
	// 				<CheckoutCard
	//                     productId={data?.id}
	//                 />

	// 				<div className="w-full mb-8 flex-shrink-0 order-1 lg:w-1/2 lg:mb-0 lg:order-2">
	// 					{isSubscription && <ProductSection product={data} />}
	// 				</div>
	// 			</div>
	// 		</div>
	// 		<footer className=" rounded-lg shadow sm:flex sm:items-center sm:justify-between p-4 sm:p-6 xl:p-8  antialiased">
	// 			<p className="mb-4 text-sm text-center  sm:mb-0">
	// 				&copy; 2019-2022{" "}
	// 				<a
	// 					href="https://flowbite.com/"
	// 					className="hover:underline"
	// 					target="_blank"
	// 				>
	// 					summaryapp.com
	// 				</a>
	// 				. All rights reserved.
	// 			</p>
	// 			<div className="flex justify-center items-center space-x-1">
	// 				<a
	// 					href="#"
	// 					data-tooltip-target="tooltip-facebook"
	// 					className="inline-flex justify-center p-2 ">
	// 					<svg
	// 						className="w-4 h-4"
	// 						aria-hidden="true"
	// 						xmlns="http://www.w3.org/2000/svg"
	// 						fill="currentColor"
	// 						viewBox="0 0 8 19"
	// 					>
	// 						<path
	// 							fill-rule="evenodd"
	// 							d="M6.135 3H8V0H6.135a4.147 4.147 0 0 0-4.142 4.142V6H0v3h2v9.938h3V9h2.021l.592-3H5V3.591A.6.6 0 0 1 5.592 3h.543Z"
	// 							clip-rule="evenodd"
	// 						/>
	// 					</svg>
	// 					<span className="sr-only">Facebook</span>
	// 				</a>
	// 			</div>
	// 		</footer>
	// 		</div>
	// )
}
