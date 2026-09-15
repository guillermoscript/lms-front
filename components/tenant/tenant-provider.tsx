'use client'

import { createContext, use, type ReactNode } from 'react'
import type { StoredKitTheme } from '@/lib/themes/kit'

export interface TenantInfo {
  id: string
  slug: string
  name: string
  logo_url: string | null
  plan: string
  settings?: Record<string, any>
  /** The plan-resolved theme kit the school renders with; null = platform palette. */
  theme: StoredKitTheme | null
}

const TenantContext = createContext<TenantInfo | null>(null)

export function TenantProvider({
  tenant,
  children,
}: {
  tenant: TenantInfo | null
  children: ReactNode
}) {
  return (
    <TenantContext.Provider value={tenant}>
      {children}
    </TenantContext.Provider>
  )
}

export function useTenant() {
  return use(TenantContext)
}
