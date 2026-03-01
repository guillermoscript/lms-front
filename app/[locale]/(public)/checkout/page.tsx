import { createClient } from "@/lib/supabase/server";
import { CheckoutForm } from "@/components/public/checkout-form";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PackageSearch, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getCurrentTenantId } from "@/lib/supabase/tenant";

interface SearchParams {
    courseId?: string;
    planId?: string;
}

export default async function CheckoutPage(props: { params: Promise<{ locale: string }>, searchParams: Promise<SearchParams> }) {
    const searchParams = await props.searchParams;
    const { courseId, planId } = searchParams;
    const t = await getTranslations('checkout');

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        const returnUrl = encodeURIComponent(`/checkout?${courseId ? `courseId=${courseId}` : `planId=${planId}`}`);
        redirect(`/auth/login?next=${returnUrl}`);
    }

    const tenantId = await getCurrentTenantId();

    // Empty state if no course or plan is provided
    if (!courseId && !planId) {
        return (
            <div className="container min-h-[70vh] flex flex-col items-center justify-center py-24 px-4 text-center">
                <div className="w-24 h-24 bg-zinc-900 rounded-3xl flex items-center justify-center mb-8 border border-zinc-800 shadow-2xl">
                    <PackageSearch className="w-12 h-12 text-zinc-600" />
                </div>
                <h1 className="text-3xl font-black text-white mb-4 tracking-tight">{t('empty.title')}</h1>
                <p className="text-zinc-500 max-w-md mb-10 leading-relaxed font-medium">
                    {t('empty.description')}
                </p>
                <Link href="/courses">
                    <Button className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold h-12 px-8 rounded-xl border border-zinc-700/50 transition-all hover:scale-105 active:scale-95 gap-2">
                        <ArrowLeft className="w-4 h-4" />
                        {t('empty.button')}
                    </Button>
                </Link>
            </div>
        );
    }

    let title = t('product');
    let price: number | string = t('free');
    let productId: number | undefined = undefined;

    if (courseId) {
        const { data: course } = await supabase
            .from("courses")
            .select("title")
            .eq("course_id", courseId)
            .eq("tenant_id", tenantId)
            .single();

        if (course) {
            title = course.title;

            // Get product price and payment provider from product_courses (pick first match)
            const { data: productCourses } = await supabase
                .from("product_courses")
                .select("product_id, product:products(price, currency, payment_provider)")
                .eq("course_id", courseId)
                .eq("tenant_id", tenantId)
                .limit(1);

            if (productCourses?.[0]?.product) {
                const product = productCourses[0].product as any;
                price = parseFloat(product.price);
                productId = productCourses[0].product_id;

                // Redirect to manual checkout if payment provider is manual
                if (product.payment_provider === 'manual') {
                    redirect(`/checkout/manual?productId=${productId}&courseId=${courseId}`);
                }
            }
        }
    } else if (planId) {
        // Fetch plan from database with payment provider
        const { data: dbPlan } = await supabase
            .from("plans")
            .select("plan_name, price, plan_id, payment_provider")
            .eq("plan_id", planId)
            .eq("tenant_id", tenantId)
            .single();

        if (dbPlan) {
            title = dbPlan.plan_name;
            price = parseFloat(dbPlan.price);

            // Redirect to manual checkout if payment provider is manual
            if (dbPlan.payment_provider === 'manual') {
                redirect(`/checkout/manual?planId=${planId}`);
            }
        }
    }

    return (
        <div className="container py-24 px-4 max-w-4xl mx-auto">
            <div className="mb-12 text-center">
                <h1 className="text-4xl font-black text-white tracking-tight mb-4">{t('title')}</h1>
                <p className="text-zinc-500 font-medium">{t('description')}</p>
            </div>
            <CheckoutForm
                courseId={courseId}
                planId={planId}
                title={title}
                price={price}
                productId={productId}
            />
        </div>
    );
}
