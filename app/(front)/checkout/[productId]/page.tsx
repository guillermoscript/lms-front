import CheckoutImages from '@/components/checkout/CheckoutImages'
import { createClient } from '@/utils/supabase/server'

export default async function CheckoutPage ({
    params
}: {
    params: { productId: string }
}) {
    const supabase = createClient()

    const { data } = await supabase
        .from('products')
        .select('*')
        .eq('product_id', params.productId)
        .single()

    console.log(data)

    return (
        <>
            <div className="grid md:grid-cols-2 gap-10 md:gap-16 w-full">
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
                            {data?.price} $
                        </div>
                        <div className="text-gray-500 dark:text-gray-400 text-lg">
                          /month
                        </div>
                    </div>
                </div>
                <CheckoutImages
                    img1src="/img/placeholder.svg"
                    img2src="/img/placeholder.svg"
                    img3src="/img/placeholder.svg"
                />
            </div>
        </>
    )
}
