'use client'

import { useState, useRef, useCallback, useMemo, createContext, use } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { upsertCertificateTemplate, type CertificateTemplateFormData } from '@/app/actions/teacher/certificates'
import { uploadCertificateAsset } from '@/app/actions/admin/certificate-assets'

export interface CertificateTemplateFormProps {
    courseId: number
    tenantId?: string
    initialData?: any
}

export const COLOR_PRESETS = [
    { primary: '#3B82F6', secondary: '#1E40AF', label: 'Blue' },
    { primary: '#10B981', secondary: '#047857', label: 'Emerald' },
    { primary: '#8B5CF6', secondary: '#5B21B6', label: 'Violet' },
    { primary: '#F59E0B', secondary: '#B45309', label: 'Amber' },
    { primary: '#EF4444', secondary: '#B91C1C', label: 'Red' },
    { primary: '#06B6D4', secondary: '#0E7490', label: 'Cyan' },
    { primary: '#EC4899', secondary: '#BE185D', label: 'Pink' },
    { primary: '#1E293B', secondary: '#0F172A', label: 'Slate' },
]

export interface CertificateTemplateContextValue {
    // State
    formData: CertificateTemplateFormData
    isLoading: boolean
    uploadingLogo: boolean
    uploadingSignature: boolean

    // Refs
    logoInputRef: React.RefObject<HTMLInputElement | null>
    signatureInputRef: React.RefObject<HTMLInputElement | null>

    // Props
    courseId: number

    // Actions
    setFormData: React.Dispatch<React.SetStateAction<CertificateTemplateFormData>>
    updateField: <K extends keyof CertificateTemplateFormData>(key: K, value: CertificateTemplateFormData[K]) => void
    updateDesignSetting: (key: string, value: any) => void
    applyPreset: (preset: typeof COLOR_PRESETS[0]) => void
    handleSubmit: (e: React.FormEvent) => Promise<void>
    handleFileChange: (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'signature') => void
    goBack: () => void
}

const CertificateTemplateContext = createContext<CertificateTemplateContextValue | null>(null)

export function useCertificateTemplate() {
    const ctx = use(CertificateTemplateContext)
    if (!ctx) throw new Error('useCertificateTemplate must be used within CertificateTemplateProvider')
    return ctx
}

export function CertificateTemplateProvider({
    courseId,
    initialData,
    children,
}: CertificateTemplateFormProps & { children: React.ReactNode }) {
    const t = useTranslations('dashboard.teacher.manageCourse.certificates.templates')
    const router = useRouter()
    const logoInputRef = useRef<HTMLInputElement>(null)
    const signatureInputRef = useRef<HTMLInputElement>(null)

    const [isLoading, setIsLoading] = useState(false)
    const [uploadingLogo, setUploadingLogo] = useState(false)
    const [uploadingSignature, setUploadingSignature] = useState(false)
    const [formData, setFormData] = useState<CertificateTemplateFormData>({
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

    const updateField = useCallback(
        <K extends keyof CertificateTemplateFormData>(key: K, value: CertificateTemplateFormData[K]) => {
            setFormData((prev) => ({ ...prev, [key]: value }))
        },
        []
    )

    const updateDesignSetting = useCallback((key: string, value: any) => {
        setFormData(prev => ({
            ...prev,
            design_settings: {
                ...prev.design_settings,
                [key]: value
            }
        }))
    }, [])

    const applyPreset = useCallback((preset: typeof COLOR_PRESETS[0]) => {
        setFormData(prev => ({
            ...prev,
            design_settings: {
                ...prev.design_settings,
                primary_color: preset.primary,
                secondary_color: preset.secondary,
            }
        }))
    }, [])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)

        try {
            const result = await upsertCertificateTemplate(courseId, formData)

            if (!result.success) {
                toast.error(result.error || t('saveError'))
                return
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

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'signature') => {
        const file = e.target.files?.[0]
        if (!file) return
        handleImageUpload(file, type)
        e.target.value = ''
    }, [])

    const goBack = useCallback(() => {
        router.back()
    }, [router])

    const value = useMemo(() => ({
        formData, isLoading, uploadingLogo, uploadingSignature,
        logoInputRef, signatureInputRef,
        courseId,
        setFormData, updateField, updateDesignSetting, applyPreset,
        handleSubmit, handleFileChange, goBack,
    }), [formData, isLoading, uploadingLogo, uploadingSignature, courseId])

    return (
        <CertificateTemplateContext value={value}>
            {children}
        </CertificateTemplateContext>
    )
}
