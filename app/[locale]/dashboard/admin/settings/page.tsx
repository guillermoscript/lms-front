import { getUserRole } from '@/lib/supabase/get-user-role'
import { redirect } from 'next/navigation'
import { getAllSettingsByCategory } from '@/app/actions/admin/settings'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import GeneralSettingsForm from '@/components/admin/general-settings-form'
import EmailSettingsForm from '@/components/admin/email-settings-form'
import PaymentSettingsForm from '@/components/admin/payment-settings-form'
import EnrollmentSettingsForm from '@/components/admin/enrollment-settings-form'

export default async function SettingsPage() {
  // Verify admin role
  const role = await getUserRole()
  if (role !== 'admin') {
    redirect('/dashboard/admin')
  }

  // Fetch all settings grouped by category
  const result = await getAllSettingsByCategory()
  
  if (!result.success || !result.data) {
    return (
      <div className="p-8">
        <Card>
          <CardHeader>
            <CardTitle>Error Loading Settings</CardTitle>
            <CardDescription>
              {result.error || 'Failed to load platform settings'}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const settings = result.data

  return (
    <div className="space-y-6 p-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Platform Settings</h1>
        <p className="text-muted-foreground mt-2">
          Configure your platform settings, email, payments, and enrollment policies.
        </p>
      </div>

      {/* Tabbed Settings Interface */}
      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 lg:w-auto">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
          <TabsTrigger value="payment">Payment</TabsTrigger>
          <TabsTrigger value="enrollment">Enrollment</TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>
                Basic platform information and global configurations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GeneralSettingsForm settings={settings.general || {}} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Email Settings */}
        <TabsContent value="email" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Email Settings</CardTitle>
              <CardDescription>
                Configure SMTP server and email notification preferences
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EmailSettingsForm settings={settings.email || {}} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payment Settings */}
        <TabsContent value="payment" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Payment Settings</CardTitle>
              <CardDescription>
                Manage payment processors, currency, and transaction settings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PaymentSettingsForm settings={settings.payment || {}} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Enrollment Settings */}
        <TabsContent value="enrollment" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Enrollment Settings</CardTitle>
              <CardDescription>
                Configure course enrollment rules and student access policies
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EnrollmentSettingsForm settings={settings.enrollment || {}} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
