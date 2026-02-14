import { createClient } from "@/lib/supabase/server";
import { CheckoutForm } from "@/components/public/checkout-form";
import { redirect } from "next/navigation";

interface SearchParams {
    courseId?: string;
    planId?: string;
}

export default async function CheckoutPage(props: { searchParams: Promise<SearchParams> }) {
    const searchParams = await props.searchParams;
    const { courseId, planId } = searchParams;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        const returnUrl = encodeURIComponent(`/checkout?${courseId ? `courseId=${courseId}` : `planId=${planId}`}`);
        redirect(`/auth/login?next=${returnUrl}`);
    }

    let title = "Product";
    let price: number | string = "Free";
    let productId: number | undefined = undefined;

    if (courseId) {
        const { data: course } = await supabase
            .from("courses")
            .select("title")
            .eq("course_id", courseId)
            .single();

        if (course) {
            title = course.title;
            
            // Get product price from product_courses (pick first match)
            const { data: productCourses } = await supabase
                .from("product_courses")
                .select("product_id, product:products(price, currency)")
                .eq("course_id", courseId)
                .limit(1);

            if (productCourses?.[0]?.product) {
                const product = productCourses[0].product as any;
                price = parseFloat(product.price);
                productId = productCourses[0].product_id;
            }
        }
    } else if (planId) {
        // Fetch plan from database
        const { data: dbPlan } = await supabase
            .from("plans")
            .select("plan_name, price, plan_id")
            .eq("plan_id", planId)
            .single();
            
        if (dbPlan) {
            title = dbPlan.plan_name;
            price = parseFloat(dbPlan.price);
            // Plans don't use productId in this context, but we might need it for manual payment if it's treated as a product
            // For now, let's keep it undefined for plans unless we have a specific manual payment product for plans
        }
    }

    return (
        <div className="container py-24 px-4">
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
