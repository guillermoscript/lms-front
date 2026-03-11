'use client'

import { useEffect } from 'react'
import { useTenant } from './tenant-provider'
import { getPresetById, FONT_OPTIONS } from '@/lib/themes/presets'

/**
 * Injects theme CSS custom properties on <html>.
 *
 * Priority (highest wins):
 * 1. Active theme preset (curated or custom) — sets all CSS variables
 * 2. Tenant primary_color / secondary_color — only overrides primary/accent
 *    when no preset is active
 *
 * Must be rendered inside TenantProvider.
 */
export function TenantCssVars() {
  const tenant = useTenant()

  useEffect(() => {
    const root = document.documentElement
    const isDark = root.classList.contains('dark')

    const storedPreset = tenant?.theme_preset ?? null

    if (storedPreset) {
      // Resolve the CSS variable map for this preset
      let light: Record<string, string> | undefined
      let dark: Record<string, string> | undefined

      if (storedPreset.type === 'curated') {
        const preset = getPresetById(storedPreset.id)
        light = preset?.variables.light
        dark = preset?.variables.dark
      } else {
        light = storedPreset.variables?.light
        dark = storedPreset.variables?.dark
      }

      const vars = isDark ? dark : light
      if (vars) {
        for (const [key, value] of Object.entries(vars)) {
          root.style.setProperty(key, value)
        }
      }

      // Apply radius override if set
      if (storedPreset.radius) {
        root.style.setProperty('--radius', storedPreset.radius)
      }

      // Apply font override if set
      if (storedPreset.fontFamily) {
        const fontDef = FONT_OPTIONS.find((f) => f.value === storedPreset.fontFamily)
        if (fontDef) {
          // Load the Google Font via <link> if not already loaded
          const linkId = 'tenant-font-link'
          if (!document.getElementById(linkId)) {
            const link = document.createElement('link')
            link.id = linkId
            link.rel = 'stylesheet'
            link.href = `https://fonts.googleapis.com/css2?family=${fontDef.googleFamily}&display=swap`
            document.head.appendChild(link)
          }
          root.style.setProperty('--font-sans', `"${storedPreset.fontFamily}", sans-serif`)
        }
      }

      // Watch for dark-mode class changes and re-apply
      const observer = new MutationObserver(() => {
        const nowDark = root.classList.contains('dark')
        const newVars = nowDark ? dark : light
        if (newVars) {
          for (const [key, value] of Object.entries(newVars)) {
            root.style.setProperty(key, value)
          }
        }
      })
      observer.observe(root, { attributes: true, attributeFilter: ['class'] })

      return () => {
        observer.disconnect()
        // Clean up only the vars we set
        const allVars = { ...(light ?? {}), ...(dark ?? {}) }
        for (const key of Object.keys(allVars)) {
          root.style.removeProperty(key)
        }
        if (storedPreset.radius) {
          root.style.removeProperty('--radius')
        }
        if (storedPreset.fontFamily) {
          root.style.removeProperty('--font-sans')
          document.getElementById('tenant-font-link')?.remove()
        }
      }
    }

    // Fallback: apply individual primary/secondary colors (legacy behaviour)
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
  }, [tenant?.primary_color, tenant?.secondary_color, tenant?.theme_preset])

  return null
}
