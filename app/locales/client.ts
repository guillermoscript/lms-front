'use client'
import { createI18nClient } from 'next-international/client'

const { useI18n: useI18nClient, useScopedI18n: useScopedI18nClient, I18nProviderClient: I18nProviderClientClient, useChangeLocale: useChangeLocaleClient, useCurrentLocale: useCurrentLocaleClient } = createI18nClient({
    en: async () => await import('./en/en'),
    es: async () => await import('./es/es')
})

export const useI18n = useI18nClient as any
export const useScopedI18n = useScopedI18nClient as any
export const I18nProviderClient = I18nProviderClientClient as any
export const useChangeLocale = useChangeLocaleClient as any
export const useCurrentLocale = useCurrentLocaleClient as any
