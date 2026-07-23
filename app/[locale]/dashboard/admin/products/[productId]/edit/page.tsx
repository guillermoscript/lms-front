import { redirect, notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTranslations } from 'next-intl/server'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { ProductCreationWizard } from '@/components/admin/product-creation-wizard'
import { getEnabledPaymentProviders } from '@/app/actions/admin/settings'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import type {
  ProductCreationPaymentProvider,
  ProductCreationWizardInput,
} from '@/lib/admin/product-creation/types'

interface PageProps {
  params: Promise<{ productId: string }>
}

type UntypedSupabaseClient = {
  from: (table: string) => {
    select: (columns?: string) => {
      eq: (column: string, value: unknown) => {
        eq: (column: string, value: unknown) => {
          order: (column: string) => Promise<{ data: unknown; error: unknown }>
        }
      }
    }
  }
}

interface ProductCourseLink {
  course_id: number
}

const supportedPaymentProviders = new Set<ProductCreationPaymentProvider>([
  'manual',
  'stripe',
  'paypal',
  'binance',
  'binance_personal',
])

function getSupportedPaymentProvider(value: string | null): ProductCreationPaymentProvider {
  if (value && supportedPaymentProviders.has(value as ProductCreationPaymentProvider)) {
    return value as ProductCreationPaymentProvider
  }

  return 'manual'
}

export default async function EditProductPage({ params }: PageProps) {
  const t = await getTranslations('dashboard.admin.products.edit')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')
  const { productId } = await params
  const supabase = createAdminClient()

  const userId = await getCurrentUserId()
  if (!userId) {
    redirect('/auth/login')
  }

  const tenantId = await getCurrentTenantId()

  const productIdNumber = parseInt(productId)

  const [
    { data: product, error },
    { data: courses },
    { data: categories },
    { data: postRegistrationSteps },
  ] = await Promise.all([
    supabase
      .from('products')
      .select(`
        *,
        product_courses (
          course_id
        )
      `)
      .eq('product_id', productIdNumber)
      .eq('tenant_id', tenantId)
      .single(),
    supabase
      .from('courses')
      .select('course_id, title, description, thumbnail_url, category_id, status')
      .eq('tenant_id', tenantId)
      .order('title'),
    supabase
      .from('course_categories')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .order('name'),
    (supabase as unknown as UntypedSupabaseClient)
      .from('product_post_registration_steps')
      .select('id, type, title, description, url, sort_order, is_active')
      .eq('product_id', productIdNumber)
      .eq('tenant_id', tenantId)
      .order('sort_order'),
  ])

  if (error || !product) {
    notFound()
  }

  // PostgREST returns product_courses as a single object (PK=product_id → one-to-one).
  // Normalise to the array shape the form expects.
  const raw = (product as { product_courses?: ProductCourseLink | ProductCourseLink[] | null })
    .product_courses
  const productWithCourses = {
    ...product,
    courses: raw == null ? [] : Array.isArray(raw) ? raw : [raw],
  }
  const linkedCourseId = productWithCourses.courses[0]?.course_id
  const linkedCourse = courses?.find((course) => course.course_id === linkedCourseId)

  type PostRegistrationRow = {
    id: number
    type: 'whatsapp' | 'telegram' | 'discord' | 'link' | 'text'
    title: string
    description: string | null
    url: string | null
    sort_order: number | null
    is_active: boolean
  }

  const initialInput: ProductCreationWizardInput = {
    intent: 'draft',
    productId: product.product_id,
    course: {
      sourceMode: 'existing',
      existingCourseId: linkedCourseId,
      title: linkedCourse?.title || product.name,
      description: linkedCourse?.description || product.description || '',
      thumbnailUrl: linkedCourse?.thumbnail_url || product.image || '',
      categoryId: linkedCourse?.category_id || null,
    },
    pricing: {
      mode: 'paid',
      price: Number(product.price),
      currency: product.currency === 'eur' ? 'eur' : 'usd',
      paymentProvider: getSupportedPaymentProvider(product.payment_provider),
    },
    postRegistrationSteps: ((postRegistrationSteps || []) as PostRegistrationRow[]).map((step, index) => ({
      id: step.id,
      type: step.type,
      title: step.title,
      description: step.description,
      url: step.url,
      sortOrder: step.sort_order ?? index,
      isActive: step.is_active,
    })),
  }

  const { data: enabledProviders } = await getEnabledPaymentProviders()
  const { data: tenant } = await supabase
    .from('tenants')
    .select('stripe_account_id')
    .eq('id', tenantId)
    .single()

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-4">
            <AdminBreadcrumb
              items={[
                { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
                { label: tBreadcrumbs('monetization'), href: '/dashboard/admin/monetization' },
                { label: tBreadcrumbs('products'), href: '/dashboard/admin/products' },
                { label: tBreadcrumbs('editProduct') },
              ]}
            />
          </div>
          <div>
            <h1 className="text-2xl font-bold md:text-3xl">{t('title')}</h1>
            <p className="mt-1 text-muted-foreground">
              {t('description')}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <ProductCreationWizard
          mode="edit"
          categories={categories || []}
          courses={courses || []}
          initialInput={initialInput}
          enabledProviders={enabledProviders}
          stripeConnected={Boolean(tenant?.stripe_account_id)}
        />

      </main>
    </div>
  )
}
