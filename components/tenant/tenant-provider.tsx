'use client'

import { createContext, useContext, type ReactNode } from 'react'

export interface TenantInfo {
  id: string
  slug: string
  name: string
  logo_url: string | null
  primary_color: string
  secondary_color: string
  plan: string
  settings?: Record<string, any>
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
  return useContext(TenantContext)
}
