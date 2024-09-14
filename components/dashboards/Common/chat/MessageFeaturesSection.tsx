'use client'

import { Eye, Loader, Pencil, Sparkle } from 'lucide-react'

import { useScopedI18n } from '@/app/locales/client'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'

import { ViewMode } from './MessageContentWrapper'

export default function MessageFeatureSection({
    viewMode,
    setViewMode,
    role,
}: {
    viewMode: ViewMode
    setViewMode: (value: ViewMode) => void
    role: 'assistant' | 'user'
}) {
    const t = useScopedI18n('MessageFeatureSection')

    return (
        <div className="flex justify-start overflow-x-auto buttons text-gray-600 dark:text-gray-500 svelte-1u5gq5j">
            <div className="flex">
                {role === 'user' && (
                    <button
                        onClick={() => {
                            console.log('Edit')
                            if (viewMode === 'view') {
                                setViewMode('edit')
                            } else {
                                setViewMode('view')
                            }
                        }}
                        className="visible p-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg dark:hover:text-white hover:text-black transition"
                    >
                        {viewMode === 'edit' ? (
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger>
                                        <Eye className="w-4 h-4" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>
                                            {t('tooltipContentView')}
                                        </p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        ) : (
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger>
                                        <Pencil className="w-4 h-4" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>
                                            {t('tooltipContentEdit')}
                                        </p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        )}
                    </button>
                )}

                {role === 'assistant' && (
                    <button
                        onClick={() => {
                            console.log('Edit')
                            if (viewMode === 'view') {
                                setViewMode('regenerate')
                            } else {
                                setViewMode('view')
                            }
                        }}
                        className="visible p-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg dark:hover:text-white hover:text-black transition"
                    >
                        {viewMode === 'view' ? (
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger>
                                        <Sparkle className="w-4 h-4" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>
                                            {t('tooltipContentRegenerate')}
                                        </p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        ) : (
                            <div className="flex items-center justify-center animate-spin">
                                <Loader className="w-4 h-4" />
                            </div>
                        )}
                    </button>
                )}
            </div>
            {/* <div aria-label="Delete" className="flex">
                <button
                    onClick={() => {
                        console.log('Delete')
                    }}
                    className="visible p-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg dark:hover:text-white hover:text-black transition"
                >
                    <Trash className="w-4 h-4" />
                </button>
            </div> */}
        </div>
    )
}
