import { createI18nServer } from 'next-international/server'

export const { getI18n, getScopedI18n, getStaticParams } = createI18nServer({
    en: async () => await import('./en/en'),
    es: async () => await import('./es/es')
})
