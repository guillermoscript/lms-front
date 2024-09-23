'use client'

import { useScopedI18n } from '@/app/locales/client'
import { DataTableColumnHeader } from '@/components/ui/Table/DataTableColumnHeader'

export default function ScopedHeader({
    scoped,
    column,
    word
}: {
    scoped: string
    column: any
    word: string
}) {
    const t = useScopedI18n(scoped)

    return (
        <DataTableColumnHeader column={column} title={t(word)} />
    )
}
