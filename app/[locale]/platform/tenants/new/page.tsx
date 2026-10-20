import Link from 'next/link'
import { PlatformPageHeader } from '@/components/platform/page-header'
import { PlatformPanel } from '@/components/platform/section'
import { CreateSchoolForm } from '@/components/platform/create-school-form'

export const metadata = { title: 'Create school' }

export default function NewTenantPage() {
  return (
    <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8" data-testid="platform-tenant-new-page">
      <PlatformPageHeader
        meta={
          <Link href="../tenants" className="hover:text-foreground hover:underline underline-offset-4">
            Schools
          </Link>
        }
        title="Create school"
        description="Set up a school on someone's behalf, choose its billing mode and name its owner."
      />
      <PlatformPanel className="max-w-2xl p-4 sm:p-6">
        <CreateSchoolForm />
      </PlatformPanel>
    </main>
  )
}
