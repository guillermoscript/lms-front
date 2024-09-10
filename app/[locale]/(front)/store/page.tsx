import Image from 'next/image'
import Link from 'next/link'

import { createClient } from '@/utils/supabase/server'

export default async function StorePage () {
    const supabase = createClient()
    const info = await supabase.from('products').select('*')

    return (
        <div className="min-h-full">
            <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24 lg:max-w-7xl lg:px-8">
                <h2 className="text-2xl font-bold tracking-tight">
                  Our Products
                </h2>

                <div className="mt-6 grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4 xl:gap-x-8">
                    {info.data?.map((product) => (
                        <div
                            key={product.product_id}
                            className="group relative"
                        >
                            <div className="aspect-h-1 aspect-w-1 w-full overflow-hidden rounded-md lg:aspect-none group-hover:opacity-75 lg:h-80">
                                <Image
                                    src={product.image}
                                    alt={product.name}
                                    width={280}
                                    height={320}
                                    className="h-full w-full object-cover object-center lg:h-full lg:w-full"
                                    placeholder="blur"
                                    layout="responsive"
                                    blurDataURL="/img/placeholder.svg"
                                />
                            </div>
                            <div className="mt-4 flex justify-between">
                                <div>
                                    <h3 className="text-sm ">
                                        <Link
                                            href={`/store/${product.product_id}`}
                                        >
                                            <span
                                                aria-hidden="true"
                                                className="absolute inset-0"
                                            />
                                            {product.name}
                                        </Link>
                                    </h3>
                                    <p className="mt-1 text-sm ">
                                        {product.description}
                                    </p>
                                </div>
                                <p className="text-sm font-medium ">
                                    {/* {product.products_pricing[0]?.price}{" "}
									{product.products_pricing[0]?.currency?.code} */}
                                    {product.price} $
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
