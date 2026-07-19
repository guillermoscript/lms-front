import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import type Stripe from 'stripe'
import { sendEmail } from '@/lib/email/send'
import { paymentFailedTemplate } from '@/lib/email/templates/payment-failed'
import { downgradeTenantToFree } from '@/lib/billing/downgrade-tenant'
import { applyPortalPlanChange } from '@/lib/payments/platform-plan-change'

function getPlatformWebhookSecret(): string {
  const secret = process.env.STRIPE_PLATFORM_WEBHOOK_SECRET
  if (!secret) {
    throw new Error('STRIPE_PLATFORM_WEBHOOK_SECRET is not set')
  }
  return secret
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = getStripe().webhooks.constructEvent(body, sig, getPlatformWebhookSecret())
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const adminClient = await createAdminClient()

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode !== 'subscription') break

        const tenantId = session.metadata?.tenant_id
        const planId = session.metadata?.plan_id
        const planSlug = session.metadata?.plan_slug
        const interval = session.metadata?.interval || 'monthly'

        if (!tenantId || !planId) {
          console.error('Missing metadata in checkout session:', session.id)
          break
        }

        // Get subscription details from Stripe
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const subscription: any = await getStripe().subscriptions.retrieve(
          session.subscription as string
        )

        // Upsert platform subscription
        await adminClient
          .from('platform_subscriptions')
          .upsert({
            tenant_id: tenantId,
            plan_id: planId,
            stripe_subscription_id: subscription.id,
            stripe_customer_id: session.customer as string,
            status: 'active',
            payment_method: 'stripe',
            interval: interval,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'tenant_id' })

        // Update tenant plan
        await adminClient
          .from('tenants')
          .update({
            plan: planSlug,
            billing_status: 'active',
            billing_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            stripe_customer_id: session.customer as string,
            updated_at: new Date().toISOString(),
          })
          .eq('id', tenantId)

        // Update revenue splits based on new plan's transaction fee
        const { data: plan } = await adminClient
          .from('platform_plans')
          .select('transaction_fee_percent')
          .eq('plan_id', planId)
          .single()

        if (plan) {
          await adminClient
            .from('revenue_splits')
            .upsert({
              tenant_id: tenantId,
              platform_percentage: plan.transaction_fee_percent,
              school_percentage: 100 - plan.transaction_fee_percent,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'tenant_id' })
        }

        console.log(`Plan activated: tenant=${tenantId}, plan=${planSlug}`)
        break
      }

      case 'customer.subscription.updated': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const subscription = event.data.object as any
        const tenantId = subscription.metadata?.tenant_id

        if (!tenantId) break

        // Update subscription period and status
        await adminClient
          .from('platform_subscriptions')
          .update({
            status: subscription.status === 'active' ? 'active'
              : subscription.status === 'past_due' ? 'past_due'
              : subscription.status,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            cancel_at_period_end: subscription.cancel_at_period_end,
            canceled_at: subscription.canceled_at
              ? new Date(subscription.canceled_at * 1000).toISOString()
              : null,
            updated_at: new Date().toISOString(),
          })
          .eq('tenant_id', tenantId)

        await adminClient
          .from('tenants')
          .update({
            billing_status: subscription.status,
            billing_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', tenantId)

        // If plan changed via Stripe portal, apply it with downgrade-limit
        // enforcement (over-limit downgrades are reverted on Stripe and admins
        // notified — see lib/payments/platform-plan-change.ts).
        await applyPortalPlanChange(subscription, {
          admin: adminClient,
          stripe: getStripe(),
        })

        break
      }

      case 'customer.subscription.deleted': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const subscription = event.data.object as any
        const tenantId = subscription.metadata?.tenant_id

        if (!tenantId) break

        // Downgrade to free — shared helper reads the free-plan fee from
        // platform_plans instead of hardcoding the revenue split.
        const platformFee = await downgradeTenantToFree(adminClient, tenantId)

        console.log(`Subscription canceled, downgraded to free: tenant=${tenantId} fee=${platformFee}%`)
        break
      }

      case 'invoice.payment_failed': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const invoice = event.data.object as any
        const subscriptionId = invoice.subscription as string

        if (!subscriptionId) break

        const { data: sub } = await adminClient
          .from('platform_subscriptions')
          .select('tenant_id')
          .eq('stripe_subscription_id', subscriptionId)
          .single()

        if (sub) {
          await adminClient
            .from('platform_subscriptions')
            .update({ status: 'past_due', updated_at: new Date().toISOString() })
            .eq('tenant_id', sub.tenant_id)

          await adminClient
            .from('tenants')
            .update({ billing_status: 'past_due', updated_at: new Date().toISOString() })
            .eq('id', sub.tenant_id)

          // Email the school admin about the failed payment
          try {
            const { data: tenantRow } = await adminClient
              .from('tenants')
              .select('name')
              .eq('id', sub.tenant_id)
              .single()

            const { data: adminUsers } = await adminClient
              .from('tenant_users')
              .select('user_id')
              .eq('tenant_id', sub.tenant_id)
              .eq('role', 'admin')
              .eq('status', 'active')

            const { data: planRow } = await adminClient
              .from('platform_subscriptions')
              .select('platform_plans(name)')
              .eq('tenant_id', sub.tenant_id)
              .single()

            const planName = (planRow?.platform_plans as any)?.name || 'your plan'
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.example.com'

            for (const admin of adminUsers || []) {
              const { data: authUser } = await adminClient.auth.admin.getUserById(admin.user_id)
              if (authUser?.user?.email) {
                const template = paymentFailedTemplate({
                  schoolName: tenantRow?.name || 'your school',
                  planName,
                  billingUrl: `${appUrl}/dashboard/admin/billing`,
                })
                await sendEmail({ to: authUser.user.email, ...template })
              }
            }
          } catch (emailErr) {
            console.error('Failed to send payment failed email:', emailErr)
          }
        }

        break
      }

      case 'invoice.paid': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const invoice = event.data.object as any
        const subscriptionId = invoice.subscription as string

        if (!subscriptionId) break

        const { data: sub } = await adminClient
          .from('platform_subscriptions')
          .select('tenant_id, status')
          .eq('stripe_subscription_id', subscriptionId)
          .single()

        // Idempotency: only update if not already active
        if (sub && sub.status !== 'active') {
          await adminClient
            .from('platform_subscriptions')
            .update({ status: 'active', updated_at: new Date().toISOString() })
            .eq('tenant_id', sub.tenant_id)

          await adminClient
            .from('tenants')
            .update({ billing_status: 'active', updated_at: new Date().toISOString() })
            .eq('id', sub.tenant_id)
        }

        break
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Platform webhook error:', error)
    return NextResponse.json({ error: 'Webhook handler error' }, { status: 500 })
  }
}
