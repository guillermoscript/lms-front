'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { toast } from 'sonner'
import {
    IconDeviceFloppy, IconLoader2, IconPalette, IconFileText,
    IconBuilding, IconQrcode, IconSignature, IconUpload,
    IconX, IconPhoto, IconChecklist, IconClock
} from '@tabler/icons-react'
import { CertificatePreview } from './certificate-preview'
import { cn } from '@/lib/utils'
import { uploadCertificateAsset } from '@/app/actions/admin/certificate-assets'

interface CertificateTemplateFormProps {
    courseId: number
    tenantId: string
    initialData?: any
}

const COLOR_PRESETS = [
    { primary: '#3B82F6', secondary: '#1E40AF', label: 'Blue' },
    { primary: '#10B981', secondary: '#047857', label: 'Emerald' },
    { primary: '#8B5CF6', secondary: '#5B21B6', label: 'Violet' },
    { primary: '#F59E0B', secondary: '#B45309', label: 'Amber' },
    { primary: '#EF4444', secondary: '#B91C1C', label: 'Red' },
    { primary: '#06B6D4', secondary: '#0E7490', label: 'Cyan' },
    { primary: '#EC4899', secondary: '#BE185D', label: 'Pink' },
    { primary: '#1E293B', secondary: '#0F172A', label: 'Slate' },
]

export function CertificateTemplateForm({ courseId, tenantId, initialData }: CertificateTemplateFormProps) {
    const t = useTranslations('dashboard.teacher.manageCourse.certificates.templates')
    const router = useRouter()
    const supabase = createClient()
    const logoInputRef = useRef<HTMLInputElement>(null)
    const signatureInputRef = useRef<HTMLInputElement>(null)

    const [isLoading, setIsLoading] = useState(false)
    const [uploadingLogo, setUploadingLogo] = useState(false)
    const [uploadingSignature, setUploadingSignature] = useState(false)
    const [formData, setFormData] = useState({
        template_name: initialData?.template_name || '',
        issuer_name: initialData?.issuer_name || process.env.NEXT_PUBLIC_APP_NAME || 'LMS Academy',
        issuer_url: initialData?.issuer_url || process.env.NEXT_PUBLIC_APP_URL || '',
        description: initialData?.description || '',
        issuance_criteria: initialData?.issuance_criteria || '',
        signature_name: initialData?.signature_name || '',
        signature_title: initialData?.signature_title || '',
        signature_image_url: initialData?.signature_image_url || '',
        logo_url: initialData?.logo_url || '',
        min_lesson_completion_pct: initialData?.min_lesson_completion_pct ?? 100,
        min_exam_pass_score: initialData?.min_exam_pass_score ?? 70,
        requires_all_exams: initialData?.requires_all_exams ?? true,
        expiration_days: initialData?.expiration_days ?? null,
        design_settings: initialData?.design_settings || {
            primary_color: '#3B82F6',
            secondary_color: '#1E40AF',
            show_qr_code: true,
            logo_url: ''
        }
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)

        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('Not authenticated')

            const { error } = await supabase
                .from('certificate_templates')
                .upsert({
                    course_id: courseId,
                    tenant_id: tenantId,
                    template_name: formData.template_name,
                    issuer_name: formData.issuer_name,
                    issuer_url: formData.issuer_url,
                    description: formData.description,
                    issuance_criteria: formData.issuance_criteria,
                    signature_name: formData.signature_name,
                    signature_title: formData.signature_title,
                    signature_image_url: formData.signature_image_url,
                    logo_url: formData.logo_url,
                    min_lesson_completion_pct: formData.min_lesson_completion_pct,
                    min_exam_pass_score: formData.min_exam_pass_score,
                    requires_all_exams: formData.requires_all_exams,
                    expiration_days: formData.expiration_days,
                    design_settings: {
                        ...formData.design_settings,
                        logo_url: formData.logo_url
                    },
                    updated_at: new Date().toISOString()
                }, { onConflict: 'course_id,tenant_id' })

            if (error) {
                console.error('Supabase error saving template:', error)
                throw error
            }

            toast.success(t('saveSuccess'))
            router.refresh()
        } catch (error: any) {
            const errorMsg = error.message || (typeof error === 'object' ? JSON.stringify(error) : String(error))
            console.error('Error saving template:', errorMsg)
            toast.error(t('saveError'))
        } finally {
            setIsLoading(false)
        }
    }

    const updateDesignSetting = (key: string, value: any) => {
        setFormData(prev => ({
            ...prev,
            design_settings: {
                ...prev.design_settings,
                [key]: value
            }
        }))
    }

    const applyPreset = (preset: typeof COLOR_PRESETS[0]) => {
        setFormData(prev => ({
            ...prev,
            design_settings: {
                ...prev.design_settings,
                primary_color: preset.primary,
                secondary_color: preset.secondary,
            }
        }))
    }

    const handleImageUpload = async (
        file: File,
        type: 'logo' | 'signature'
    ) => {
        const setUploading = type === 'logo' ? setUploadingLogo : setUploadingSignature

        setUploading(true)
        try {
            const fd = new FormData()
            fd.append('file', file)
            fd.append('type', type)

            const result = await uploadCertificateAsset(fd)

            if (!result.success) {
                toast.error(result.error || 'Upload failed')
                return
            }

            if (type === 'logo') {
                setFormData(prev => ({ ...prev, logo_url: result.data!.url }))
            } else {
                setFormData(prev => ({ ...prev, signature_image_url: result.data!.url }))
            }

            toast.success(t('uploadSuccess'))
        } catch {
            toast.error(t('uploadError'))
        } finally {
            setUploading(false)
        }
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'signature') => {
        const file = e.target.files?.[0]
        if (!file) return
        handleImageUpload(file, type)
        e.target.value = ''
    }

    return (
        <div className="grid gap-8 lg:grid-cols-5">
            {/* Form side */}
            <div className="lg:col-span-3">
                <form onSubmit={handleSubmit} className="space-y-8">
                    {/* Info section */}
                    <div className="space-y-5">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                <IconFileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            </div>
                            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/70">
                                {t('certificateInfo')}
                            </h2>
                        </div>

                        <div className="space-y-4 pl-[42px]">
                            <div className="space-y-2">
                                <Label htmlFor="template_name" className="text-sm font-medium">
                                    {t('nameLabel')}
                                </Label>
                                <Input
                                    id="template_name"
                                    value={formData.template_name}
                                    onChange={e => setFormData(prev => ({ ...prev, template_name: e.target.value }))}
                                    placeholder={t('namePlaceholder')}
                                    className="h-11"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="description" className="text-sm font-medium">
                                    {t('descriptionLabel')}
                                </Label>
                                <Textarea
                                    id="description"
                                    value={formData.description}
                                    onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                    placeholder={t('descriptionPlaceholder')}
                                    rows={3}
                                    className="resize-none"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="issuance_criteria" className="text-sm font-medium">
                                    {t('criteriaLabel')}
                                </Label>
                                <Textarea
                                    id="issuance_criteria"
                                    value={formData.issuance_criteria}
                                    onChange={e => setFormData(prev => ({ ...prev, issuance_criteria: e.target.value }))}
                                    placeholder={t('criteriaPlaceholder')}
                                    rows={2}
                                    className="resize-none"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Issuer section */}
                    <div className="space-y-5">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                                <IconBuilding className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                            </div>
                            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/70">
                                {t('issuerDetails')}
                            </h2>
                        </div>

                        <div className="space-y-4 pl-[42px]">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="issuer_name" className="text-sm font-medium">
                                        {t('issuerNameLabel')}
                                    </Label>
                                    <Input
                                        id="issuer_name"
                                        value={formData.issuer_name}
                                        onChange={e => setFormData(prev => ({ ...prev, issuer_name: e.target.value }))}
                                        className="h-11"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="issuer_url" className="text-sm font-medium">
                                        {t('issuerUrlLabel')}
                                    </Label>
                                    <Input
                                        id="issuer_url"
                                        value={formData.issuer_url}
                                        onChange={e => setFormData(prev => ({ ...prev, issuer_url: e.target.value }))}
                                        placeholder={t('issuerUrlPlaceholder')}
                                        className="h-11"
                                    />
                                </div>
                            </div>

                            {/* Logo upload */}
                            <div className="space-y-2">
                                <Label className="text-sm font-medium">{t('logoLabel')}</Label>
                                <p className="text-xs text-muted-foreground">{t('logoDescription')}</p>
                                <div className="flex items-center gap-3">
                                    {formData.logo_url ? (
                                        <div className="relative group">
                                            <img
                                                src={formData.logo_url}
                                                alt="Logo"
                                                className="h-16 w-16 rounded-lg object-contain border bg-white p-1"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setFormData(prev => ({ ...prev, logo_url: '' }))}
                                                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <IconX className="h-3 w-3" />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="h-16 w-16 rounded-lg border-2 border-dashed flex items-center justify-center text-muted-foreground/40">
                                            <IconPhoto className="h-6 w-6" />
                                        </div>
                                    )}
                                    <div>
                                        <input
                                            ref={logoInputRef}
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={e => handleFileChange(e, 'logo')}
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => logoInputRef.current?.click()}
                                            disabled={uploadingLogo}
                                            className="gap-1.5"
                                        >
                                            {uploadingLogo ? (
                                                <IconLoader2 className="h-3.5 w-3.5 motion-safe:animate-spin" />
                                            ) : (
                                                <IconUpload className="h-3.5 w-3.5" />
                                            )}
                                            {formData.logo_url ? t('changeLogo') : t('uploadLogo')}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Signature section */}
                    <div className="space-y-5">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                                <IconSignature className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/70">
                                {t('signature')}
                            </h2>
                        </div>

                        <div className="space-y-4 pl-[42px]">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="signature_name" className="text-sm font-medium">
                                        {t('signatureNameLabel')}
                                    </Label>
                                    <Input
                                        id="signature_name"
                                        value={formData.signature_name}
                                        onChange={e => setFormData(prev => ({ ...prev, signature_name: e.target.value }))}
                                        placeholder={t('signatureNamePlaceholder')}
                                        className="h-11"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="signature_title" className="text-sm font-medium">
                                        {t('signatureTitleLabel')}
                                    </Label>
                                    <Input
                                        id="signature_title"
                                        value={formData.signature_title}
                                        onChange={e => setFormData(prev => ({ ...prev, signature_title: e.target.value }))}
                                        placeholder={t('signatureTitlePlaceholder')}
                                        className="h-11"
                                    />
                                </div>
                            </div>

                            {/* Signature image upload */}
                            <div className="space-y-2">
                                <Label className="text-sm font-medium">{t('signatureImageLabel')}</Label>
                                <p className="text-xs text-muted-foreground">{t('signatureImageDescription')}</p>
                                <div className="flex items-center gap-3">
                                    {formData.signature_image_url ? (
                                        <div className="relative group">
                                            <img
                                                src={formData.signature_image_url}
                                                alt="Signature"
                                                className="h-12 w-32 rounded-lg object-contain border bg-white p-1"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setFormData(prev => ({ ...prev, signature_image_url: '' }))}
                                                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <IconX className="h-3 w-3" />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="h-12 w-32 rounded-lg border-2 border-dashed flex items-center justify-center text-muted-foreground/40">
                                            <IconSignature className="h-5 w-5" />
                                        </div>
                                    )}
                                    <div>
                                        <input
                                            ref={signatureInputRef}
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={e => handleFileChange(e, 'signature')}
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => signatureInputRef.current?.click()}
                                            disabled={uploadingSignature}
                                            className="gap-1.5"
                                        >
                                            {uploadingSignature ? (
                                                <IconLoader2 className="h-3.5 w-3.5 motion-safe:animate-spin" />
                                            ) : (
                                                <IconUpload className="h-3.5 w-3.5" />
                                            )}
                                            {formData.signature_image_url ? t('changeSignature') : t('uploadSignature')}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Completion Criteria section */}
                    <div className="space-y-5">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center">
                                <IconChecklist className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                            </div>
                            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/70">
                                {t('completionCriteria')}
                            </h2>
                        </div>

                        <div className="space-y-5 pl-[42px]">
                            {/* Min lesson completion */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <Label className="text-sm font-medium">{t('minLessonCompletion')}</Label>
                                    <span className="text-sm font-mono font-medium tabular-nums text-primary">
                                        {formData.min_lesson_completion_pct}%
                                    </span>
                                </div>
                                <Slider
                                    value={[formData.min_lesson_completion_pct]}
                                    onValueChange={(v) => setFormData(prev => ({ ...prev, min_lesson_completion_pct: Array.isArray(v) ? v[0] : v }))}
                                    min={0}
                                    max={100}
                                    step={5}
                                />
                                <p className="text-xs text-muted-foreground">{t('minLessonCompletionHint')}</p>
                            </div>

                            {/* Min exam pass score */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <Label className="text-sm font-medium">{t('minExamPassScore')}</Label>
                                    <span className="text-sm font-mono font-medium tabular-nums text-primary">
                                        {formData.min_exam_pass_score}%
                                    </span>
                                </div>
                                <Slider
                                    value={[formData.min_exam_pass_score]}
                                    onValueChange={(v) => setFormData(prev => ({ ...prev, min_exam_pass_score: Array.isArray(v) ? v[0] : v }))}
                                    min={0}
                                    max={100}
                                    step={5}
                                />
                                <p className="text-xs text-muted-foreground">{t('minExamPassScoreHint')}</p>
                            </div>

                            {/* Requires all exams */}
                            <div className="flex items-center justify-between p-4 rounded-xl border bg-muted/20">
                                <div className="space-y-0.5">
                                    <Label className="text-sm font-medium">{t('requiresAllExams')}</Label>
                                    <p className="text-xs text-muted-foreground">{t('requiresAllExamsHint')}</p>
                                </div>
                                <Switch
                                    checked={formData.requires_all_exams}
                                    onCheckedChange={checked => setFormData(prev => ({ ...prev, requires_all_exams: checked }))}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Expiration section */}
                    <div className="space-y-5">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                                <IconClock className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                            </div>
                            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/70">
                                {t('expiration')}
                            </h2>
                        </div>

                        <div className="space-y-4 pl-[42px]">
                            <div className="flex items-center justify-between p-4 rounded-xl border bg-muted/20">
                                <div className="space-y-0.5">
                                    <Label className="text-sm font-medium">{t('enableExpiration')}</Label>
                                    <p className="text-xs text-muted-foreground">{t('enableExpirationHint')}</p>
                                </div>
                                <Switch
                                    checked={formData.expiration_days !== null}
                                    onCheckedChange={checked => setFormData(prev => ({
                                        ...prev,
                                        expiration_days: checked ? 365 : null
                                    }))}
                                />
                            </div>

                            {formData.expiration_days !== null && (
                                <div className="space-y-2">
                                    <Label htmlFor="expiration_days" className="text-sm font-medium">
                                        {t('expirationDays')}
                                    </Label>
                                    <div className="flex items-center gap-3">
                                        <Input
                                            id="expiration_days"
                                            type="number"
                                            min={1}
                                            max={3650}
                                            value={formData.expiration_days ?? 365}
                                            onChange={e => setFormData(prev => ({
                                                ...prev,
                                                expiration_days: parseInt(e.target.value) || 365
                                            }))}
                                            className="h-11 w-32"
                                        />
                                        <span className="text-sm text-muted-foreground">{t('days')}</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        {formData.expiration_days
                                            ? t('expirationPreview', { years: (formData.expiration_days / 365).toFixed(1) })
                                            : ''}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Design section */}
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

                    {/* Submit buttons */}
                    <div className="flex justify-end gap-3 pt-4 border-t">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => router.back()}
                            disabled={isLoading}
                        >
                            {t('cancel')}
                        </Button>
                        <Button type="submit" disabled={isLoading} className="gap-2 px-6">
                            {isLoading ? (
                                <IconLoader2 className="h-4 w-4 motion-safe:animate-spin" />
                            ) : (
                                <IconDeviceFloppy className="h-4 w-4" />
                            )}
                            {t('submit')}
                        </Button>
                    </div>
                </form>
            </div>

            {/* Preview side */}
            <div className="lg:col-span-2 lg:sticky lg:top-8 h-fit space-y-4">
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/70 px-1">
                    {t('preview.title')}
                </h2>
                <div className="scale-[0.8] origin-top transform-gpu">
                    <CertificatePreview
                        templateName={formData.template_name}
                        issuerName={formData.issuer_name}
                        designSettings={formData.design_settings}
                        signatureName={formData.signature_name}
                        signatureTitle={formData.signature_title}
                        signatureImageUrl={formData.signature_image_url}
                        logoUrl={formData.logo_url}
                    />
                </div>
                <p className="text-center text-[10px] text-muted-foreground italic">
                    {t('preview.livePreviewHint')}
                </p>
            </div>
        </div>
    )
}
