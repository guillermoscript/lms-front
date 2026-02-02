import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { IconArrowLeft } from '@tabler/icons-react'
import { ProductForm } from '@/components/admin/product-form'

interface PageProps {
  params: Promise<{ productId: string }>
}

export default async function EditProductPage({ params }: PageProps) {
  const { productId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Fetch product with courses
  const { data: product, error } = await supabase
    .from('products')
    .select(`
      *,
      product_courses (
        course_id
      )
    `)
    .eq('product_id', parseInt(productId))
    .single()

  if (error || !product) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
          <Link href="/dashboard/admin/products">
            <Button variant="ghost" size="sm" className="mb-4">
              <IconArrowLeft className="mr-2 h-4 w-4" />
              Back to Products
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold md:text-3xl">Edit Product</h1>
            <p className="mt-1 text-muted-foreground">
              Update product details and Stripe configuration
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Card>
          <CardHeader>
            <CardTitle>{product.name}</CardTitle>
            <CardDescription>
              Changes to price or currency will create a new Stripe price.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProductForm mode="edit" initialData={product} />
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
