// app/[locale]/client/layout.tsx
import { Metadata } from 'next'
import { ReactElement } from 'react'

import { I18nProviderClient } from '../locales/client'

export const metadata: Metadata = {
    title: 'Bienvenido a nuestra plataforma',
    description: 'Explora las opciones que tenemos para ti',
    openGraph: {
        images: ['/img/hero.png'],
    },
}

export default function SubLayout({ params: { locale }, children }: { params: { locale: string }, children: ReactElement }) {
    return (
        <I18nProviderClient locale={locale}>
            {children}
        </I18nProviderClient>
    )
}
