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

    if (courseId) {
        const { data: course } = await supabase
            .from("courses")
            .select("title")
            .eq("course_id", courseId)
            .single();

        if (course) {
            title = course.title;
            
            // Get product price from product_courses
            const { data: productCourse } = await supabase
                .from("product_courses")
                .select("product:products(price, currency)")
                .eq("course_id", courseId)
                .single();

            if (productCourse?.product) {
                const product = productCourse.product as any;
                price = parseFloat(product.price);
            }
        }
    } else if (planId) {
        // Fetch plan from database
        const { data: dbPlan } = await supabase
            .from("plans")
            .select("plan_name, price")
            .eq("plan_id", planId)
            .single();
            
        if (dbPlan) {
            title = dbPlan.plan_name;
            price = parseFloat(dbPlan.price);
        }
    }

    return (
        <div className="container py-24 px-4">
            <CheckoutForm
                courseId={courseId}
                planId={planId}
                title={title}
                price={price}
            />
        </div>
    );
}
