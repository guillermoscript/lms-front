'use client'
import { Separator } from '@radix-ui/react-select'
import { Code2 } from 'lucide-react'
import { useMediaQuery } from 'usehooks-ts'

import { useScopedI18n } from '@/app/locales/client'

import ToggleableSection from './ToggleableSection'

export default function EmbedCodeSection({
    embed_code,
}: {
    embed_code: string
}) {
    const t = useScopedI18n('EmbedCodeSection')
    const isMobile = useMediaQuery('(max-width: 640px)')

    console.log(t('description'))

    if (isMobile) {
        return (
            <>
                <div className="flex flex-col mb-10 gap-4">
                    <h3 className="text-xl font-semibold mt-4">
                        {t('embed')}
                    </h3>
                    <p className="my-2">
                        {t('description')}
                    </p>
                    <iframe
                        src={embed_code}
                        style={{ width: '100%', height: '500px', border: 0, borderRadius: '4px', overflow: 'hidden' }}
                        allow="accelerometer; ambient-light-sensor; camera; encrypted-media; geolocation; gyroscope; hid; microphone; midi; payment; usb; vr; xr-spatial-tracking"
                        sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
                        className="resize "
                    />
                    <Separator />
                </div>
            </>
        )
    }

    return (
        <>
            <ToggleableSection
                isOpen
                title={
                    <div className="flex items-center gap-2">
                        <Code2 className="h-6 w-6" />{t('embed')}
                    </div>
                }
                cardClassName='p-0'
            >
                <div className="flex flex-col mb-10 gap-4">
                    <p className="my-2">
                        {t('description')}
                    </p>
                    <iframe
                        src={embed_code}
                        style={{ width: '100%', height: '500px', border: 0, borderRadius: '4px', overflow: 'hidden' }}
                        allow="accelerometer; ambient-light-sensor; camera; encrypted-media; geolocation; gyroscope; hid; microphone; midi; payment; usb; vr; xr-spatial-tracking"
                        sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
                        className="resize "
                    />
                    <Separator />
                </div>
            </ToggleableSection>
        </>
    )
}
