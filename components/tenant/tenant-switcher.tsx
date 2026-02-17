'use client'

import { useState } from 'react'
import { useTenant } from './tenant-provider'
import { createClient } from '@/lib/supabase/client'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { ChevronsUpDown, Plus, School } from 'lucide-react'

interface TenantOption {
  id: string
  slug: string
  name: string
  role: string
}

export function TenantSwitcher({ tenants }: { tenants: TenantOption[] }) {
  const currentTenant = useTenant()

  if (tenants.length <= 1) return null

  const handleSwitch = async (tenantId: string, slug: string) => {
    const supabase = createClient()

    // Update preferred tenant in user metadata
    await supabase.auth.updateUser({
      data: { preferred_tenant_id: tenantId }
    })

    // Force session refresh to get new JWT claims with updated tenant_id
    await supabase.auth.refreshSession()

    // Navigate to new subdomain
    const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || 'lmsplatform.com'
    window.location.href = `https://${slug}.${platformDomain}/dashboard`
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button variant="ghost" size="sm" className="gap-2 text-zinc-400 hover:text-white">
          <School className="h-4 w-4" />
          <span className="hidden sm:inline max-w-[120px] truncate">
            {currentTenant?.name || 'Select School'}
          </span>
          <ChevronsUpDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Your Schools</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {tenants.map((t) => (
          <DropdownMenuItem
            key={t.id}
            onClick={() => handleSwitch(t.id, t.slug)}
            className={t.id === currentTenant?.id ? 'bg-accent' : ''}
          >
            <School className="mr-2 h-4 w-4" />
            <span className="flex-1 truncate">{t.name}</span>
            <span className="text-xs text-muted-foreground capitalize">{t.role}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => window.location.href = '/create-school'}>
          <Plus className="mr-2 h-4 w-4" />
          Create New School
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
