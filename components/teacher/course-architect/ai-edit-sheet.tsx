'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { IconSparkles } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/components/ui/sheet'
import { CourseArchitectChat } from './course-architect-chat'
import type { ArchitectScope } from './scope'

interface Props {
    /** Fixed scope; the chat is not forked, only hosted. */
    scope: Exclude<ArchitectScope, { type: 'new' }>
    className?: string
}

/** Contextual "Edit with AI" entry: the shared architect chat in a side sheet. */
export function AiEditSheet({ scope, className }: Props) {
    const t = useTranslations('courseArchitect')
    const locale = useLocale() === 'es' ? 'es' : 'en'
    const router = useRouter()
    const [open, setOpen] = useState(false)

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
                render={
                    <Button
                        variant="outline"
                        size="sm"
                        className={className ?? 'gap-2'}
                        data-testid={`ai-edit-${scope.type}`}
                    />
                }
            >
                <IconSparkles className="h-3.5 w-3.5" aria-hidden />
                {t('editWithAi')}
            </SheetTrigger>
            <SheetContent side="right" className="w-full gap-0 sm:max-w-xl">
                <SheetHeader className="border-b pr-12">
                    <SheetTitle>{t(`editSheet.${scope.type}.title`)}</SheetTitle>
                    <SheetDescription>{t(`editSheet.${scope.type}.description`)}</SheetDescription>
                </SheetHeader>
                {/* Mounted only while open so each opening starts a fresh chat. */}
                {open && (
                    <CourseArchitectChat
                        scope={scope}
                        locale={locale}
                        onContentChanged={() => router.refresh()}
                        className="flex min-h-0 flex-1 flex-col"
                    />
                )}
            </SheetContent>
        </Sheet>
    )
}
