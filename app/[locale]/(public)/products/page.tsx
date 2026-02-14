import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default async function ProductsPage() {
  const supabase = await createClient()

  // Get all active products
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  return (
    <div className="container mx-auto py-12">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-4">Available Products</h1>
        <p className="text-muted-foreground">
          Browse our available courses and products. Select one to get started.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {products?.map((product) => (
          <Card key={product.product_id}>
            <CardHeader>
              <CardTitle>{product.name}</CardTitle>
              <CardDescription>{product.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                ${product.price} {product.currency.toUpperCase()}
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                Payment Method: {product.payment_provider === 'manual' ? 'Manual/Offline' : product.payment_provider}
              </div>
            </CardContent>
            <CardFooter>
              <Link href={`/products/${product.product_id}`} className="w-full">
                <Button className="w-full">
                  {product.payment_provider === 'manual' ? 'Request Payment Info' : 'Buy Now'}
                </Button>
              </Link>
            </CardFooter>
          </Card>
        ))}
      </div>

      {!products || products.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No products available at the moment.</p>
        </div>
      )}
    </div>
  )
}
