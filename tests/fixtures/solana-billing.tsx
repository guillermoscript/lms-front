/** Browser component regression harness. Prepared props + mocked API responses;
 * this does not exercise a real subscription or prove Devnet settlement. */
import { createRoot } from 'react-dom/client'
import { NextIntlClientProvider } from 'next-intl'
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { SolanaRenewalDetails, BillingDateTime } from '@/components/student/solana-renewal-details'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Toaster } from '@/components/ui/sonner'
import messages from '@/messages/en.json'

const state = new URLSearchParams(location.search).get('state') ?? 'pending'
const ended = state === 'ended'
const canceled = state === 'canceled' || ended
const pending = state === 'pending'
const router = {back(){},forward(){},refresh(){document.documentElement.dataset.refreshed='true'},push(){},replace(){},prefetch:async()=>{},bfcacheId:'qa-fixture'}
createRoot(document.getElementById('root')!).render(
  <AppRouterContext.Provider value={router}>
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 sm:p-8">
        <p className="text-xs text-muted-foreground">Component QA fixture · prepared state · mocked API · no live payment</p>
        <h1 className="text-2xl font-semibold">Billing &amp; purchases</h1>
        <Card>
          <CardHeader><div className="flex flex-wrap justify-between gap-2"><CardTitle>QA subscription · 0.01 USDC per hour</CardTitle><Badge variant="outline">{canceled?'Scheduled to end':pending?'Confirmation unresolved':'Past due'}</Badge></div></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap justify-between gap-2 text-sm"><span>{canceled?'Paid access until':'Last verified paid deadline'}</span><BillingDateTime date="2030-01-01T00:00:00Z" /></div>
            <SolanaRenewalDetails subscriptionId={210011} pastDue={!canceled} insufficientFunds={state==='insufficient'} confirmationUnresolved={pending} canceled={canceled} ended={ended} price={0.01} wallet="FmJvMsNXi8xcXAh7qDwToEhijT9my4bkQKDtMUwZpHRj" devnet lastRenewal={null} />
          </CardContent>
        </Card>
      </main>
      <Toaster />
    </NextIntlClientProvider>
  </AppRouterContext.Provider>,
)
