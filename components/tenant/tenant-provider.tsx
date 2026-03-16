'use client'

import { createContext, use, type ReactNode } from 'react'
import type { StoredPreset } from '@/lib/themes/presets'

export interface TenantInfo {
  id: string
  slug: string
  name: string
  logo_url: string | null
  primary_color: string
  secondary_color: string
  plan: string
  settings?: Record<string, any>
  /** Active theme preset, if one has been applied */
  theme_preset?: StoredPreset | null
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
