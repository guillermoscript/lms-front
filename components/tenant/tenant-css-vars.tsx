'use client'

import { useEffect } from 'react'
import { useTenant } from './tenant-provider'
import { resolvePresetVars } from './tenant-css-vars-server'

/**
 * Client companion to TenantCssVarsServer.
 *
 * The server component injects the initial CSS variables as a <style> tag
 * so there's no flash. This client component only watches for dark/light
 * mode class changes and re-applies the correct variable set.
 */
export function TenantCssVars() {
  const tenant = useTenant()

  useEffect(() => {
    const storedPreset = tenant?.theme_preset ?? null
    if (!storedPreset) return

    const { light, dark } = resolvePresetVars(storedPreset)
    if (!light && !dark) return

    const root = document.documentElement

    function applyVars() {
      const isDark = root.classList.contains('dark')
      const vars = isDark ? dark : light
      if (vars) {
        for (const [key, value] of Object.entries(vars)) {
          root.style.setProperty(key, value)
        }
      }
      if (storedPreset!.radius) {
        root.style.setProperty('--radius', storedPreset!.radius!)
      }
      if (storedPreset!.fontFamily) {
        root.style.setProperty('--font-sans', `"${storedPreset!.fontFamily}", sans-serif`)
      }
    }

    // Watch for dark-mode class changes and re-apply
    const observer = new MutationObserver(applyVars)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })

    return () => {
      observer.disconnect()
    }
  }, [tenant?.theme_preset])

  return null
}
