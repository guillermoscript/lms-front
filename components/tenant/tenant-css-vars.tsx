'use client'

import { useEffect } from 'react'
import { useTenant } from './tenant-provider'

/**
 * Injects tenant primary/secondary colors as CSS custom properties on <html>.
 * Must be rendered inside TenantProvider.
 */
export function TenantCssVars() {
  const tenant = useTenant()

  useEffect(() => {
    const root = document.documentElement
    if (tenant?.primary_color) {
      root.style.setProperty('--primary', tenant.primary_color)
      root.style.setProperty('--sidebar-primary', tenant.primary_color)
      root.style.setProperty('--accent', tenant.primary_color)
    }
    if (tenant?.secondary_color) {
      root.style.setProperty('--secondary-brand', tenant.secondary_color)
    }
    return () => {
      root.style.removeProperty('--primary')
      root.style.removeProperty('--sidebar-primary')
      root.style.removeProperty('--accent')
      root.style.removeProperty('--secondary-brand')
    }
  }, [tenant?.primary_color, tenant?.secondary_color])

  return null
}
