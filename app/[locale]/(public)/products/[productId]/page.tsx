import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ManualPaymentButton } from '@/components/student/manual-payment-button'

export default async function ProductDetailPage({
  params
}: {
  params: Promise<{ productId: string }>
}) {
  const supabase = await createClient()
  const { productId: productIdStr } = await params
  const productId = parseInt(productIdStr)

  // Get product details
  const { data: product, error } = await supabase
    .from('products')
    .select('*')
    .eq('product_id', productId)
    .eq('status', 'active')
    .single()

  if (error || !product) {
    redirect('/products')
  }

  // Check if user is authenticated
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="container mx-auto py-12">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">{product.name}</CardTitle>
            <CardDescription className="text-lg">{product.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="text-4xl font-bold mb-2">
                ${product.price} {product.currency.toUpperCase()}
              </div>
              <div className="text-sm text-muted-foreground">
                Payment Method: {product.payment_provider === 'manual' ? 'Manual/Offline Payment' : product.payment_provider}
              </div>
            </div>

            {product.payment_provider === 'manual' && (
              <div className="bg-muted p-4 rounded-lg">
                <h3 className="font-semibold mb-2">How Manual Payment Works:</h3>
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                  <li>Click the button below to request payment information</li>
                  <li>We'll send you payment instructions via email</li>
                  <li>Complete the payment using your preferred method (bank transfer, etc.)</li>
                  <li>Once verified, you'll get instant access to your course</li>
                </ol>
              </div>
            )}

            <div className="pt-4">
              {user ? (
                <ManualPaymentButton
                  productId={product.product_id}
                  productName={product.name}
                  productPrice={parseFloat(product.price)}
                  productCurrency={product.currency}
                />
              ) : (
                <div className="text-center">
                  <p className="text-muted-foreground mb-4">Please login to request payment information</p>
                  <a href="/auth/login">
                    <button className="bg-primary text-primary-foreground px-4 py-2 rounded-md">
                      Login
                    </button>
                  </a>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
