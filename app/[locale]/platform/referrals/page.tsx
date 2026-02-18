import { createAdminClient } from '@/lib/supabase/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { GenerateCodeForm } from './generate-code-form'

export default async function PlatformReferralsPage() {
  const adminClient = createAdminClient()

  const [codesResult, redemptionsResult, tenantsResult] = await Promise.all([
    adminClient
      .from('referral_codes')
      .select('*, tenants(name, slug)')
      .order('created_at', { ascending: false })
      .limit(50),
    adminClient
      .from('referral_redemptions')
      .select('*, referral_codes(code), tenants!referral_redemptions_redeemed_by_tenant_id_fkey(name)')
      .order('created_at', { ascending: false })
      .limit(50),
    adminClient
      .from('tenants')
      .select('id, name, slug')
      .eq('status', 'active')
      .order('name')
      .limit(200),
  ])

  const codes = codesResult.data || []
  const redemptions = redemptionsResult.data || []
  const tenants = tenantsResult.data || []

  const totalCodes = codes.length
  const activeCodes = codes.filter(c => c.is_active).length
  const totalRedemptions = redemptions.length
  const referrerRewarded = redemptions.filter(r => r.referrer_rewarded).length

  return (
    <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8" data-testid="platform-referrals-page">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Referral Program</h1>
        <p className="text-muted-foreground mt-1">Manage invite codes and track conversions.</p>
      </div>

      {/* Summary Cards */}
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        {[
          { label: 'Active Codes', value: activeCodes },
          { label: 'Total Codes', value: totalCodes },
          { label: 'Redemptions', value: totalRedemptions },
          { label: 'Referrers Rewarded', value: referrerRewarded },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="text-3xl font-bold mt-1">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Generate Code Form */}
        <Card>
          <CardHeader><CardTitle>Generate Referral Code</CardTitle></CardHeader>
          <CardContent>
            <GenerateCodeForm tenants={tenants} />
          </CardContent>
        </Card>

        {/* Recent Redemptions */}
        <Card>
          <CardHeader><CardTitle>Recent Redemptions</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">School</th>
                    <th className="px-4 py-3 text-left font-medium">Code</th>
                    <th className="px-4 py-3 text-left font-medium">Rewarded</th>
                    <th className="px-4 py-3 text-left font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {redemptions.map((r: any) => (
                    <tr key={r.redemption_id} className="border-b last:border-0">
                      <td className="px-4 py-3">{r.tenants?.name || '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs">{r.referral_codes?.code}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Badge variant={r.referee_rewarded ? 'default' : 'secondary'} className="text-xs">
                            Referee {r.referee_rewarded ? '✓' : '…'}
                          </Badge>
                          <Badge variant={r.referrer_rewarded ? 'default' : 'secondary'} className="text-xs">
                            Referrer {r.referrer_rewarded ? '✓' : '…'}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {format(new Date(r.created_at), 'MMM d')}
                      </td>
                    </tr>
                  ))}
                  {redemptions.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                        No redemptions yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* All Codes Table */}
        <Card className="lg:col-span-2" data-testid="referral-codes-card">
          <CardHeader><CardTitle>All Referral Codes</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="referral-codes-table">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Code</th>
                    <th className="px-4 py-3 text-left font-medium">Owner</th>
                    <th className="px-4 py-3 text-right font-medium">Used / Max</th>
                    <th className="px-4 py-3 text-right font-medium">Discount</th>
                    <th className="px-4 py-3 text-right font-medium">Referrer Reward</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {codes.map((c: any) => (
                    <tr key={c.code_id} className="border-b last:border-0 hover:bg-muted/30" data-testid="referral-code-row" data-code={c.code}>
                      <td className="px-4 py-3 font-mono font-bold">{c.code}</td>
                      <td className="px-4 py-3">{c.tenants?.name || 'Platform'}</td>
                      <td className="px-4 py-3 text-right">
                        {c.used_count} / {c.max_uses ?? '∞'}
                      </td>
                      <td className="px-4 py-3 text-right">{c.discount_months} mo</td>
                      <td className="px-4 py-3 text-right">{c.referrer_reward_months} mo</td>
                      <td className="px-4 py-3">
                        <Badge variant={c.is_active ? 'default' : 'secondary'}>
                          {c.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {format(new Date(c.created_at), 'MMM d, yyyy')}
                      </td>
                    </tr>
                  ))}
                  {codes.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                        No referral codes yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
