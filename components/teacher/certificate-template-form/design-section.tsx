'use client'

import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { IconPalette, IconQrcode } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { useCertificateTemplate, COLOR_PRESETS } from './certificate-template-context'

export function DesignSection() {
    const t = useTranslations('dashboard.teacher.manageCourse.certificates.templates')
    const { formData, updateDesignSetting, applyPreset } = useCertificateTemplate()

    return (
        <div className="space-y-5">
            <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <IconPalette className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/70">
                    {t('design')}
                </h2>
            </div>

            <div className="space-y-6 pl-[42px]">
                {/* Color presets */}
                <div className="space-y-2.5">
                    <Label className="text-sm font-medium">{t('colorTheme')}</Label>
                    <div className="flex flex-wrap gap-2">
                        {COLOR_PRESETS.map((preset) => {
                            const isActive =
                                formData.design_settings.primary_color === preset.primary &&
                                formData.design_settings.secondary_color === preset.secondary
                            return (
                                <button
                                    key={preset.label}
                                    type="button"
                                    onClick={() => applyPreset(preset)}
                                    className={cn(
                                        'flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-xs font-medium',
                                        'outline-none focus-visible:ring-2 focus-visible:ring-primary',
                                        isActive
                                            ? 'border-primary bg-primary/5 shadow-sm'
                                            : 'hover:border-muted-foreground/30 hover:bg-muted/50'
                                    )}
                                >
                                    <div className="flex -space-x-1">
                                        <div
                                            className="w-4 h-4 rounded-full border-2 border-white dark:border-gray-900"
                                            style={{ backgroundColor: preset.primary }}
                                        />
                                        <div
                                            className="w-4 h-4 rounded-full border-2 border-white dark:border-gray-900"
                                            style={{ backgroundColor: preset.secondary }}
                                        />
                                    </div>
                                    {preset.label}
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Custom colors */}
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">{t('primaryColor')}</Label>
                        <div className="flex items-center gap-3">
                            <Input
                                type="color"
                                value={formData.design_settings.primary_color}
                                onChange={e => updateDesignSetting('primary_color', e.target.value)}
                                className="h-10 w-16 p-1 cursor-pointer"
                            />
                            <code className="text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded">
                                {formData.design_settings.primary_color}
                            </code>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">{t('secondaryColor')}</Label>
                        <div className="flex items-center gap-3">
                            <Input
                                type="color"
                                value={formData.design_settings.secondary_color}
                                onChange={e => updateDesignSetting('secondary_color', e.target.value)}
                                className="h-10 w-16 p-1 cursor-pointer"
                            />
                            <code className="text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded">
                                {formData.design_settings.secondary_color}
                            </code>
                        </div>
                    </div>
                </div>

                {/* QR code toggle */}
                <div className="flex items-center justify-between p-4 rounded-xl border bg-muted/20">
                    <div className="flex items-center gap-3">
                        <IconQrcode className="h-5 w-5 text-muted-foreground" />
                        <div className="space-y-0.5">
                            <Label className="text-sm font-medium">{t('showQrCode')}</Label>
                            <p className="text-xs text-muted-foreground">
                                {t('qrCodeDescription')}
                            </p>
                        </div>
                    </div>
                    <Switch
                        checked={formData.design_settings.show_qr_code}
                        onCheckedChange={checked => updateDesignSetting('show_qr_code', checked)}
                    />
                </div>
            </div>
        </div>
    )
}
