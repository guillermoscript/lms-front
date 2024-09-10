import { createI18nServer } from 'next-international/server'

const { getI18n: getI18nServer, getScopedI18n: getScopedI18nServer, getStaticParams: getStaticParamsServer, getCurrentLocale: getCurrentLocaleServer } = createI18nServer({
    en: async () => await import('./en/en'),
    es: async () => await import('./es/es')
})

export const getI18n = getI18nServer as any
export const getScopedI18n = getScopedI18nServer as any
export const getStaticParams = getStaticParamsServer as any
export const getCurrentLocale = getCurrentLocaleServer as any
