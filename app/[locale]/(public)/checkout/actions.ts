'use server';

import { createClient as createServerClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { getCurrentUserId, getCurrentTenantId } from '@/lib/supabase/tenant'
import { headers } from 'next/headers';
import { freeEnrollmentLimiter, getClientIp } from '@/lib/rate-limit';
import { joinCurrentSchool } from '@/app/actions/join-school';

/**
 * Mock checkout — creates a successful transaction.
 *
 * Enrollment is handled by the `after_transaction_insert` DB trigger
 * (`trigger_manage_transactions`), which calls `enroll_user` /
 * `handle_new_subscription` — the same single path the Stripe webhook uses.
 * In production this action is replaced by the Stripe webhook.
 */
export async function enrollUser(courseId?: string, planId?: string, paymentMethod: string = 'mock_test') {
    // 1. Authenticate user + resolve tenant
    const supabase = await createServerClient();
    const userId = await getCurrentUserId()
    if (!userId) {
        throw new Error("You must be logged in to enroll.");
    }
    const tenantId = await getCurrentTenantId();

    try {
        if (courseId) {
            // Get product for this course (pick first match, scoped to tenant)
            const { data: productCourses } = await supabase
                .from('product_courses')
                .select('product_id, product:products(*)')
                .eq('course_id', parseInt(courseId))
                .eq('tenant_id', tenantId)
                .limit(1);

            if (!productCourses || productCourses.length === 0) {
                throw new Error("No product found for this course.");
            }

            const product = productCourses[0].product as unknown as {
                product_id: number;
                price: number | string;
                currency: string;
            };

            // Create the transaction. The after_transaction_insert trigger
            // enrolls the user (entitlements + enrollment record) — no explicit
            // RPC call here, the trigger is the single enrollment path.
            const { data: transaction, error: txError } = await supabase
                .from('transactions')
                .insert({
                    user_id: userId,
                    tenant_id: tenantId,
                    product_id: product.product_id,
                    amount: product.price,
                    currency: product.currency,
                    payment_method: paymentMethod,
                    status: 'successful' // Note: must be 'successful' not 'succeeded'
                })
                .select()
                .single();

            if (txError) {
                console.error("Transaction error:", txError);
                throw new Error("Failed to create transaction: " + txError.message);
            }

            revalidatePath('/dashboard/student');
            return { success: true, transaction_id: transaction.transaction_id };

        } else if (planId) {
            // Get plan details (scoped to tenant)
            const { data: plan, error: planError } = await supabase
                .from('plans')
                .select('*')
                .eq('plan_id', parseInt(planId))
                .eq('tenant_id', tenantId)
                .single();

            if (planError || !plan) {
                throw new Error("Plan not found.");
            }

            // Create the transaction. The after_transaction_insert trigger
            // creates the subscription + entitlements (or extends an existing
            // subscription on renewal).
            const { data: transaction, error: txError } = await supabase
                .from('transactions')
                .insert({
                    user_id: userId,
                    tenant_id: tenantId,
                    plan_id: plan.plan_id,
                    amount: plan.price,
                    currency: plan.currency,
                    payment_method: paymentMethod,
                    status: 'successful'
                })
                .select()
                .single();

            if (txError) {
                console.error("Transaction error:", txError);
                throw new Error("Failed to create transaction: " + txError.message);
            }

            revalidatePath('/dashboard/student');
            return { success: true, transaction_id: transaction.transaction_id };
        }

        throw new Error("Must provide either courseId or planId");

    } catch (error) {
        console.error("Enrollment failed:", error);
        throw error;
    }
}

/**
 * Enroll the current user in a free course.
 *
 * Grants a `free` entitlement via the grant_free_entitlement RPC
 * (SECURITY DEFINER, idempotent). No product/transaction is fabricated.
 * See docs/ENTITLEMENTS_MIGRATION_PLAN.md.
 */
/**
 * Activate a free (price = 0) plan for the current user.
 *
 * Grants via the grant_free_subscription RPC (SECURITY DEFINER, idempotent),
 * which creates a synthetic zero-amount transaction so the standard
 * transaction trigger builds the subscription + entitlements, then sets a
 * far-future period end so free subscriptions never expire.
 */
export async function subscribeFree(planId?: string) {
    const supabase = await createServerClient();
    const userId = await getCurrentUserId()
    if (!userId) {
        throw new Error("You must be logged in to subscribe.");
    }
    const tenantId = await getCurrentTenantId();

    const requestHeaders = await headers();
    const clientIp = getClientIp({ headers: requestHeaders });
    try {
        await Promise.all([
            freeEnrollmentLimiter.check(30, `user:${userId}`),
            freeEnrollmentLimiter.check(100, `ip:${clientIp}`),
        ]);
    } catch {
        throw new Error("Too many enrollment attempts. Please slow down and try again later.");
    }

    try {
        const numericPlanId = Number(planId);
        if (!Number.isSafeInteger(numericPlanId) || numericPlanId <= 0) {
            throw new Error("Invalid plan.");
        }

        // Validate the plan: tenant-owned, not deleted, genuinely free. The RPC
        // re-checks price server-side; this gives a friendlier early error.
        const { data: plan, error: planError } = await supabase
            .from('plans')
            .select('plan_id, price, tenant_id, deleted_at')
            .eq('plan_id', numericPlanId)
            .eq('tenant_id', tenantId)
            .is('deleted_at', null)
            .single();

        if (planError || !plan) {
            throw new Error("Plan not found.");
        }
        if (Number(plan.price) !== 0) {
            throw new Error("This plan is not free. Please use the paid checkout.");
        }

        // Signup-while-subscribing: join the school first (same as enrollFree).
        const { data: membership } = await supabase
            .from('tenant_users')
            .select('id')
            .eq('user_id', userId)
            .eq('tenant_id', tenantId)
            .eq('status', 'active')
            .maybeSingle();

        if (!membership) {
            const joinResult = await joinCurrentSchool();
            if (!joinResult.success) {
                throw new Error(joinResult.error || "Could not join this school.");
            }
        }

        const { error: grantError } = await supabase.rpc('grant_free_subscription', {
            _user_id: userId,
            _plan_id: numericPlanId,
        });

        if (grantError) {
            console.error("Free subscription grant failed:", grantError);
            throw new Error("Failed to activate the plan. Please try again.");
        }

        revalidatePath('/dashboard/student');
        revalidatePath('/dashboard/student/browse');
        return { success: true };
    } catch (error) {
        console.error("Free subscription failed:", error);
        throw error;
    }
}

export async function enrollFree(courseId?: string) {
    const supabase = await createServerClient();
    const userId = await getCurrentUserId()
    if (!userId) {
        throw new Error("You must be logged in to enroll.");
    }
    const tenantId = await getCurrentTenantId();

    const requestHeaders = await headers();
    const clientIp = getClientIp({ headers: requestHeaders });
    try {
        await Promise.all([
            freeEnrollmentLimiter.check(30, `user:${userId}`),
            freeEnrollmentLimiter.check(100, `ip:${clientIp}`),
        ]);
    } catch {
        throw new Error("Too many enrollment attempts. Please slow down and try again later.");
    }

    try {
        if (!courseId) {
            throw new Error("Free enrollment only supported for courses currently.");
        }

        const numericCourseId = Number(courseId);
        if (!Number.isSafeInteger(numericCourseId) || numericCourseId <= 0) {
            throw new Error("Invalid course.");
        }

        // 1. Validate the course: it must belong to this tenant and be published.
        // Prevents enrolling in another tenant's course or an unpublished draft
        // via a crafted checkout URL.
        const { data: course, error: courseError } = await supabase
            .from('courses')
            .select('course_id, status, tenant_id')
            .eq('course_id', numericCourseId)
            .eq('tenant_id', tenantId)
            .single();

        if (courseError || !course) {
            throw new Error("Course not found.");
        }
        if (course.status !== 'published') {
            throw new Error("This course is not available for enrollment.");
        }

        // 2. Guard: reject if a paid product is linked to this course.
        const { data: productCourses, error: productError } = await supabase
            .from('product_courses')
            .select('product:products(price)')
            .eq('course_id', numericCourseId)
            .eq('tenant_id', tenantId);

        if (productError) {
            throw new Error("Could not verify course pricing.");
        }

        const hasPaidProduct = productCourses?.some(({ product }) => {
            const linkedProduct = product as unknown as { price: number | string } | null;
            return linkedProduct !== null && Number(linkedProduct.price) !== 0;
        });

        if (hasPaidProduct) {
            throw new Error("This course is not free. Please use the paid enrollment flow.");
        }

        // 3. A brand-new account (signup-while-enrolling) has no tenant
        // membership yet, which grant_free_entitlement requires. Join the
        // school first through the standard path (invitation- and
        // student-limit-aware) so enrollment stays one click.
        const { data: membership } = await supabase
            .from('tenant_users')
            .select('id')
            .eq('user_id', userId)
            .eq('tenant_id', tenantId)
            .eq('status', 'active')
            .maybeSingle();

        if (!membership) {
            const joinResult = await joinCurrentSchool();
            if (!joinResult.success) {
                throw new Error(joinResult.error || "Could not join this school.");
            }
        }

        // 3. Grant a free entitlement (entitlements model). Idempotent.
        const { error: grantError } = await supabase.rpc('grant_free_entitlement', {
            _user_id: userId,
            _course_id: numericCourseId,
        });

        if (grantError) {
            console.error("Free entitlement grant failed:", grantError);
            throw new Error("Failed to enroll. Please try again.");
        }

        revalidatePath('/dashboard/student');
        revalidatePath(`/dashboard/student/courses/${numericCourseId}`);
        return { success: true };
    } catch (error) {
        console.error("Free enrollment failed:", error);
        throw error;
    }
}
