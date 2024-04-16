import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import Image from "next/image";
import Link from "next/link";

export default async function ProductIdPage({params}: {params: {productId: string}}) {
	
    const cookieStore = cookies()
    const supabase = createClient(cookieStore)

    const data = await supabase.from('products').select(`
        id,
        name,
        description,
        products_pricing ( id, price, currency ( code ) )
    `).eq('id', params.productId).single()

    console.log(data)
    const product = data.data

	return (
        
		<div className="w-full max-w-[800px] mx-auto">
			<div className="pt-6">
				<nav aria-label="Breadcrumb">
					<ol
						role="list"
						className="mx-auto flex max-w-2xl items-center space-x-2 px-4 sm:px-6 lg:max-w-7xl lg:px-8"
					>
						{/* {product.breadcrumbs.map((breadcrumb) => (
							<li key={breadcrumb.id}>
								<div className="flex items-center">
									<a
										href={breadcrumb.href}
										className="mr-2 text-sm font-medium text-gray-900"
									>
										{breadcrumb.name}
									</a>
									<svg
										width={16}
										height={20}
										viewBox="0 0 16 20"
										fill="currentColor"
										aria-hidden="true"
										className="h-5 w-4 text-gray-300"
									>
										<path d="M5.697 4.34L8.98 16.532h1.327L7.025 4.341H5.697z" />
									</svg>
								</div>
							</li>
						))} */}
						<li className="text-sm">
							
                            {product?.name}
							
						</li>
					</ol>
				</nav>

				{/* Image gallery */}
				<div className="mt-8">
                    <Image
                        src="https://tailwindui.com/img/ecommerce-images/product-page-02-secondary-product-shot.jpg"
                        alt="Model wearing plain white basic tee."
                        width={1310}
                        height={873}
                        className="w-full h-full object-center object-cover"
                    />
				</div>

				{/* Product info */}
				<div className="mx-auto max-w-2xl px-4 pb-16 pt-10 sm:px-6 lg:grid lg:max-w-7xl lg:grid-cols-3 lg:grid-rows-[auto,auto,1fr] lg:gap-x-8 lg:px-8 lg:pb-24 lg:pt-16">
					<div className="lg:col-span-2 lg:border-r lg:border-gray-200 lg:pr-8">
						<h1 className="text-2xl font-bold tracking-tight  sm:text-3xl">
							{product?.name}
						</h1>
					</div>

					{/* Options */}
					<div className="mt-4 lg:row-span-3 lg:mt-0">
						<h2 className="sr-only">Product information</h2>
						<p className="text-3xl tracking-tight">
							{product?.products_pricing[0]?.price}{" "} {product?.products_pricing[0]?.currency?.code}
						</p>

						{/* Reviews */}
						{/* <div className="mt-6">
							<h3 className="sr-only">Reviews</h3>
							<div className="flex items-center">
								<div className="flex items-center">
									{[0, 1, 2, 3, 4].map((rating) => (
										<StarIcon
											key={rating}
											className={classNames(
												reviews.average > rating
													? "text-gray-900"
													: "text-gray-200",
												"h-5 w-5 flex-shrink-0"
											)}
											aria-hidden="true"
										/>
									))}
								</div>
								<p className="sr-only">
									{reviews.average} out of 5 stars
								</p>
								<a
									href={reviews.href}
									className="ml-3 text-sm font-medium text-indigo-600 hover:text-indigo-500"
								>
									{reviews.totalCount} reviews
								</a>
							</div>
						</div> */}

							{/* Colors */} {/* Sizes */}
						{/* <form className="mt-10">
							<div>
								<h3 className="text-sm font-medium text-gray-900">
									Color
								</h3>

								<RadioGroup
									value={selectedColor}
									onChange={setSelectedColor}
									className="mt-4"
								>
									<RadioGroup.Label className="sr-only">
										Choose a color
									</RadioGroup.Label>
									<div className="flex items-center space-x-3">
										{product.colors.map((color) => (
											<RadioGroup.Option
												key={color.name}
												value={color}
												className={({
													active,
													checked,
												}) =>
													classNames(
														color.selectedClass,
														active && checked
															? "ring ring-offset-1"
															: "",
														!active && checked
															? "ring-2"
															: "",
														"relative -m-0.5 flex cursor-pointer items-center justify-center rounded-full p-0.5 focus:outline-none"
													)
												}
											>
												<RadioGroup.Label
													as="span"
													className="sr-only"
												>
													{color.name}
												</RadioGroup.Label>
												<span
													aria-hidden="true"
													className={classNames(
														color.class,
														"h-8 w-8 rounded-full border border-black border-opacity-10"
													)}
												/>
											</RadioGroup.Option>
										))}
									</div>
								</RadioGroup>
							</div>

							<div className="mt-10">
								<div className="flex items-center justify-between">
									<h3 className="text-sm font-medium text-gray-900">
										Size
									</h3>
									<a
										href="#"
										className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
									>
										Size guide
									</a>
								</div>

								<RadioGroup
									value={selectedSize}
									onChange={setSelectedSize}
									className="mt-4"
								>
									<RadioGroup.Label className="sr-only">
										Choose a size
									</RadioGroup.Label>
									<div className="grid grid-cols-4 gap-4 sm:grid-cols-8 lg:grid-cols-4">
										{product.sizes.map((size) => (
											<RadioGroup.Option
												key={size.name}
												value={size}
												disabled={!size.inStock}
												className={({ active }) =>
													classNames(
														size.inStock
															? "cursor-pointer bg-white text-gray-900 shadow-sm"
															: "cursor-not-allowed bg-gray-50 text-gray-200",
														active
															? "ring-2 ring-indigo-500"
															: "",
														"group relative flex items-center justify-center rounded-md border py-3 px-4 text-sm font-medium uppercase hover:bg-gray-50 focus:outline-none sm:flex-1 sm:py-6"
													)
												}
											>
												{({ active, checked }) => (
													<>
														<RadioGroup.Label as="span">
															{size.name}
														</RadioGroup.Label>
														{size.inStock ? (
															<span
																className={classNames(
																	active
																		? "border"
																		: "border-2",
																	checked
																		? "border-indigo-500"
																		: "border-transparent",
																	"pointer-events-none absolute -inset-px rounded-md"
																)}
																aria-hidden="true"
															/>
														) : (
															<span
																aria-hidden="true"
																className="pointer-events-none absolute -inset-px rounded-md border-2 border-gray-200"
															>
																<svg
																	className="absolute inset-0 h-full w-full stroke-2 text-gray-200"
																	viewBox="0 0 100 100"
																	preserveAspectRatio="none"
																	stroke="currentColor"
																>
																	<line
																		x1={0}
																		y1={100}
																		x2={100}
																		y2={0}
																		vectorEffect="non-scaling-stroke"
																	/>
																</svg>
															</span>
														)}
													</>
												)}
											</RadioGroup.Option>
										))}
									</div>
								</RadioGroup>
							</div>
						</form> */}
                        <Link href={`/checkout/${product?.id}`}
								type="submit"
								className={buttonVariants({ variant: "outline" } )+ ' w-full mt-10'}
							>
								Buy
                        </Link>
					</div>

					<div className="py-10 lg:col-span-2 lg:col-start-1 lg:border-r lg:border-gray-200 lg:pb-16 lg:pr-8 lg:pt-6">
						{/* Description and details */}
						<div>
							<h3 className="sr-only">Description</h3>

							<div className="space-y-6">
								<p className="text-base ">
									{product?.description}
								</p>
							</div>
						</div>

						<div className="mt-10">
							<h3 className="text-sm font-medium ">
								Highlights
							</h3>

							<div className="mt-4">
								<ul
									role="list"
									className="list-disc space-y-2 pl-4 text-sm"
								>
									{/* {product.highlights.map((highlight) => (
										<li
											key={highlight}
											className="text-gray-400"
										>
											<span className="text-gray-600">
												{highlight}
											</span>
										</li>
									))} */}
								</ul>
							</div>
						</div>

						{/* <div className="mt-10">
							<h2 className="text-sm font-medium text-gray-900">
								Details
							</h2>

							<div className="mt-4 space-y-6">
								<p className="text-sm text-gray-600">
									{product.details}
								</p>
							</div>
						</div> */}
					</div>
				</div>
			</div>
		</div>
	);
}
