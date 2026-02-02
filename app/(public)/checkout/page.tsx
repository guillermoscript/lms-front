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
            .select("title, price")
            .eq("id", courseId)
            .single();

        if (course) {
            title = course.title;
            price = course.price || "Free";
        }
    } else if (planId) {
        // Mock plan data since we hardcoded plans in PricingPage
        const plans: Record<string, { name: string, price: number }> = {
            "monthly": { name: "Monthly Access", price: 29 },
            "yearly": { name: "Yearly Pro", price: 290 }
        };
        const plan = plans[planId];
        if (plan) {
            title = plan.name;
            price = plan.price;
        } else {
            // Try fetch DB
            const { data: dbPlan } = await supabase
                .from("plans")
                .select("name, price")
                .eq("id", planId)
                .single();
            if (dbPlan) {
                title = dbPlan.name;
                price = dbPlan.price;
            }
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
