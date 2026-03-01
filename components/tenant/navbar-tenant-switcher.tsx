'use client'

import { TenantSwitcher } from './tenant-switcher'

interface TenantOption {
  id: string
  slug: string
  name: string
  role: string
}

export function NavbarTenantSwitcher({ tenants }: { tenants: TenantOption[] }) {
  return <TenantSwitcher tenants={tenants} />
}
