import { createClient } from "@/lib/supabase/server";
import { CheckoutForm } from "@/components/public/checkout-form";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PackageSearch, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getCurrentTenantId } from "@/lib/supabase/tenant";
import { getSessionUser } from '@/lib/supabase/tenant'
import { getSolanaSettlementOptions } from "@/app/actions/admin/settings";
import { findConflictingSubscription } from "@/lib/payments/subscription-guard";
import { SubscriptionConflictNotice } from "@/components/public/subscription-conflict-notice";
import { PROVIDER_CAPABILITIES, type PaymentProvider } from "@/lib/payments/types";

interface SearchParams {
    courseId?: string;
    planId?: string;
}

export default async function CheckoutPage(props: { params: Promise<{ locale: string }>, searchParams: Promise<SearchParams> }) {
    const [searchParams, { locale }, t, supabase, user] = await Promise.all([
        props.searchParams,
        props.params,
        getTranslations('checkout'),
        createClient(),
        getSessionUser(),
    ]);
    const { courseId, planId } = searchParams;
    if (!user) {
        const returnUrl = encodeURIComponent(`/checkout?${courseId ? `courseId=${courseId}` : `planId=${planId}`}`);
        redirect(`/auth/login?next=${returnUrl}`);
    }

    const [tenantId, { data: profile }] = await Promise.all([
        getCurrentTenantId(),
        supabase
            .from('profiles')
            .select('full_name')
            .eq('id', user.id)
            .single(),
    ]);

    const userName = profile?.full_name || '';
    const userEmail = user.email || '';

    // Empty state if no course or plan is provided
    if (!courseId && !planId) {
        return (
            <div className="min-h-[70vh] flex flex-col items-center justify-center py-24 px-4 text-center">
                <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                    <PackageSearch className="h-8 w-8 text-muted-foreground" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight">{t('empty.title')}</h1>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                    {t('empty.description')}
                </p>
                <Link href="/courses" className="mt-8">
                    <Button variant="outline" className="gap-2">
                        <ArrowLeft className="h-4 w-4" />
                        {t('empty.button')}
                    </Button>
                </Link>
            </div>
        );
    }

    let title = t('product');
    let description: string | null = null;
    let price: number | string = t('free');
    let currency = 'USD';
    let productId: number | undefined = undefined;
    let durationDays: number | undefined = undefined;
    let features: string | null = null;
    let paymentProvider: string | null = null;

    if (courseId) {
        const { data: course } = await supabase
            .from("courses")
            .select("title, description")
            .eq("course_id", courseId)
            .eq("tenant_id", tenantId)
            .single();

        if (course) {
            title = course.title;
            description = course.description;

            const { data: productCourses } = await supabase
                .from("product_courses")
                .select("product_id, product:products(price, currency, payment_provider, description)")
                .eq("course_id", courseId)
                .eq("tenant_id", tenantId);

            const paidProductCourse = productCourses?.find(({ product }) => {
                const candidate = product as unknown as { price: number | string } | null;
                return candidate !== null && Number(candidate.price) > 0;
            });
            // No paid product linked → this is a free course; enrollment, not
            // a purchase. Route to the one-click flow regardless of provider.
            if (!paidProductCourse) {
                redirect(`/courses/${courseId}?enroll=1`);
            }

            if (paidProductCourse?.product) {
                const product = paidProductCourse.product as unknown as {
                    price: number | string;
                    currency: string | null;
                    payment_provider: string | null;
                    description: string | null;
                };
                price = Number(product.price);
                currency = product.currency?.toUpperCase() || 'USD';
                productId = paidProductCourse.product_id;
                paymentProvider = product.payment_provider ?? null;
                if (product.description) description = product.description;

                if (product.payment_provider === 'manual') {
                    redirect(`/checkout/manual?productId=${productId}&courseId=${courseId}`);
                }
            }
        }
    } else if (planId) {
        const { data: dbPlan } = await supabase
            .from("plans")
            .select("plan_name, price, plan_id, currency, payment_provider, description, duration_in_days, features")
            .eq("plan_id", planId)
            .eq("tenant_id", tenantId)
            .single();

        if (dbPlan) {
            // Parallel-subscription guard (#459): a live subscription to a
            // different plan means this checkout would double-bill — show the
            // blocking notice instead of any payment UI. Same-plan renewal
            // falls through to the normal form.
            const conflict = await findConflictingSubscription(supabase, {
                userId: user.id,
                tenantId,
                planId: dbPlan.plan_id,
            });
            if (conflict) {
                // Self-service switch (#463): only when the current subscription's
                // provider supports an automated plan change AND the target plan
                // uses the same provider — cross-provider switches still need admin
                // help, so they keep the "contact your school" copy.
                const currentProvider = (conflict.payment_provider || 'manual') as PaymentProvider;
                const caps = PROVIDER_CAPABILITIES[currentProvider];
                const canSwitchPlan =
                    !!caps &&
                    (caps.supportsPlanChange || !caps.supportsNativeSubscriptions) &&
                    (!dbPlan.payment_provider || dbPlan.payment_provider === currentProvider);
                return (
                    <div className="min-h-screen bg-background">
                        <div className="mx-auto max-w-xl px-4 py-12 sm:py-20">
                            <div className="mb-8 text-center">
                                <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
                            </div>
                            <SubscriptionConflictNotice
                                currentPlanName={conflict.plan_name}
                                targetPlanId={dbPlan.plan_id}
                                canSwitchPlan={canSwitchPlan}
                            />
                        </div>
                    </div>
                );
            }

            title = dbPlan.plan_name;
            description = dbPlan.description;
            price = parseFloat(dbPlan.price);
            currency = dbPlan.currency?.toUpperCase() || 'USD';
            durationDays = dbPlan.duration_in_days;
            features = dbPlan.features;
            paymentProvider = dbPlan.payment_provider ?? null;

            if (dbPlan.payment_provider === 'manual') {
                redirect(`/checkout/manual?planId=${planId}`);
            }
        }
    }

    const formattedPrice = typeof price === 'number'
        ? new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2 }).format(price)
        : null;

    // For one-time Solana, which settlement tokens this school offers (USDC is
    // always available when configured; native SOL is opt-in per school).
    const solanaOptions = paymentProvider === 'solana'
        ? await getSolanaSettlementOptions()
        : null;
    const solanaCurrencies = solanaOptions
        ? ([
            ...(solanaOptions.usdc ? ['usdc'] : []),
            ...(solanaOptions.sol ? ['sol'] : []),
          ] as ('usdc' | 'sol')[])
        : undefined;

    return (
        <div className="min-h-screen bg-background">
            <div className="mx-auto max-w-xl px-4 py-12 sm:py-20">
                {/* Header */}
                <div className="mb-8 text-center">
                    <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
                    <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
                </div>

                <CheckoutForm
                    courseId={courseId}
                    planId={planId}
                    title={title}
                    description={description}
                    price={price}
                    formattedPrice={formattedPrice}
                    productId={productId}
                    durationDays={durationDays}
                    features={features}
                    userName={userName}
                    userEmail={userEmail}
                    paymentProvider={paymentProvider}
                    solanaCurrencies={solanaCurrencies}
                />
            </div>
        </div>
    );
}
