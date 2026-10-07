'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { setAristotleCourseModel, type AristotleModelState } from '@/app/actions/teacher/aristotle-model'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { IconDeviceFloppy, IconLoader2 } from '@tabler/icons-react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

interface AristotleConfigProps {
    courseId: number
    tenantId: string
    initialConfig?: {
        tutor_id?: string
        enabled: boolean
        persona: string
        teaching_approach: string
        boundaries: string
        model_config?: Record<string, unknown> | null
    } | null
    /** Providers the school has connected + the course's current override; null when the viewer cannot read it. */
    modelState?: AristotleModelState | null
}

const DEFAULT_MODEL = '__default__'
const modelValue = (provider: string, model: string) => `${provider}::${model}`

export function AristotleConfig({ courseId, tenantId, initialConfig, modelState }: AristotleConfigProps) {
    const [enabled, setEnabled] = useState(initialConfig?.enabled ?? false)
    const [persona, setPersona] = useState(initialConfig?.persona ?? '')
    const [teachingApproach, setTeachingApproach] = useState(initialConfig?.teaching_approach ?? '')
    const [boundaries, setBoundaries] = useState(initialConfig?.boundaries ?? '')
    const [interleavingEnabled, setInterleavingEnabled] = useState((initialConfig?.model_config as Record<string, unknown> | null | undefined)?.['interleaving_enabled'] !== false)
    const [isSaving, setIsSaving] = useState(false)
    const [selectedModel, setSelectedModel] = useState(
        modelState?.current ? modelValue(modelState.current.provider, modelState.current.model) : DEFAULT_MODEL,
    )
    const savedModel = modelState?.current ? modelValue(modelState.current.provider, modelState.current.model) : DEFAULT_MODEL
    const modelItems: { id: string; label: string; vision: boolean; provider: string; providerLabel: string; value: string }[] =
        (modelState?.providers ?? []).flatMap((p) =>
            p.models.map((m) => ({ ...m, provider: p.provider as string, providerLabel: p.label, value: modelValue(p.provider, m.id) })),
        )
    // A saved override that is no longer listed (key removed, cache refreshed) must still render, not blank out.
    if (selectedModel !== DEFAULT_MODEL && !modelItems.some((m) => m.value === selectedModel)) {
        const [provider, ...rest] = selectedModel.split('::')
        modelItems.push({ id: rest.join('::'), label: rest.join('::'), vision: false, provider, providerLabel: provider, value: selectedModel })
    }
    const t = useTranslations('aristotle.config')

    const handleSave = async () => {
        setIsSaving(true)
        try {
            const supabase = createClient()

            if (initialConfig?.tutor_id) {
                const { error } = await supabase
                    .from('course_ai_tutors')
                    .update({
                        enabled,
                        persona,
                        teaching_approach: teachingApproach,
                        boundaries,
                        model_config: { ...(initialConfig?.model_config ?? {}), interleaving_enabled: interleavingEnabled },
                    })
                    .eq('tutor_id', initialConfig.tutor_id)

                if (error) throw error
            } else {
                const { error } = await supabase
                    .from('course_ai_tutors')
                    .insert({
                        course_id: courseId,
                        tenant_id: tenantId,
                        enabled,
                        persona,
                        teaching_approach: teachingApproach,
                        boundaries,
                        model_config: { ...(initialConfig?.model_config ?? {}), interleaving_enabled: interleavingEnabled },
                    })

                if (error) throw error
            }

            // The model override is written by a server action (it checks the school's
            // connected providers). It needs the tutor row, so it runs after the save above.
            if (modelState && selectedModel !== savedModel) {
                const [provider, ...rest] = selectedModel.split('::')
                const result = await setAristotleCourseModel(
                    selectedModel === DEFAULT_MODEL
                        ? { courseId, provider: null, model: null }
                        : { courseId, provider, model: rest.join('::') },
                )
                if (!result.ok) {
                    toast.error(t('modelSaveFailed'))
                    return
                }
                if (result.warning === 'vision_unknown') toast.warning(t('modelVisionWarning'))
            }

            toast.success(t('saved'))
        } catch (error) {
            console.error('Failed to save Aristotle config:', error)
            toast.error(t('saveFailed'))
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-3">
                    <span className="text-2xl leading-none" aria-hidden>&#966;</span>
                    <div>
                        <CardTitle className="text-lg">{t('title')}</CardTitle>
                        <CardDescription>{t('description')}</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <Label htmlFor="aristotle-enabled" className="font-medium">{t('enable')}</Label>
                        <p className="text-sm text-muted-foreground mt-0.5">{t('enableDesc')}</p>
                    </div>
                    <Switch
                        id="aristotle-enabled"
                        checked={enabled}
                        onCheckedChange={setEnabled}
                    />
                </div>

                {enabled && (
                    <>
                        <div className="flex items-center justify-between">
                            <div>
                                <Label htmlFor="aristotle-interleaving" className="font-medium">{t('interleaving')}</Label>
                                <p className="text-sm text-muted-foreground mt-0.5">{t('interleavingHint')}</p>
                            </div>
                            <Switch
                                id="aristotle-interleaving"
                                checked={interleavingEnabled}
                                onCheckedChange={setInterleavingEnabled}
                            />
                        </div>

                        {modelState && (
                            <div className="space-y-2">
                                <Label htmlFor="aristotle-model">{t('model')}</Label>
                                {modelState.providers.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">{t('modelNoProviders')}</p>
                                ) : (
                                    <Select
                                        items={[
                                            { value: DEFAULT_MODEL, label: t('modelDefault') },
                                            ...modelItems.map((m) => ({ value: m.value, label: m.label })),
                                        ]}
                                        value={selectedModel}
                                        onValueChange={(value) => setSelectedModel(value ?? DEFAULT_MODEL)}
                                    >
                                        <SelectTrigger id="aristotle-model" className="w-full">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectGroup>
                                                <SelectItem value={DEFAULT_MODEL}>{t('modelDefault')}</SelectItem>
                                            </SelectGroup>
                                            {[...new Set(modelItems.map((m) => m.provider))].map((provider) => (
                                                <SelectGroup key={provider}>
                                                    <SelectLabel>
                                                        {modelItems.find((m) => m.provider === provider)?.providerLabel}
                                                    </SelectLabel>
                                                    {modelItems
                                                        .filter((m) => m.provider === provider)
                                                        .map((m) => (
                                                            <SelectItem key={m.value} value={m.value}>
                                                                {m.label}
                                                                {m.vision ? ` (${t('modelVision')})` : ''}
                                                            </SelectItem>
                                                        ))}
                                                </SelectGroup>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                                <p className="text-xs text-muted-foreground">{t('modelHint')}</p>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="persona">{t('persona')}</Label>
                            <Textarea
                                id="persona"
                                value={persona}
                                onChange={(e) => setPersona(e.target.value)}
                                placeholder={t('personaPlaceholder')}
                                rows={4}
                            />
                            <p className="text-xs text-muted-foreground">{t('personaHint')}</p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="teaching-approach">{t('approach')}</Label>
                            <Textarea
                                id="teaching-approach"
                                value={teachingApproach}
                                onChange={(e) => setTeachingApproach(e.target.value)}
                                placeholder={t('approachPlaceholder')}
                                rows={3}
                            />
                            <p className="text-xs text-muted-foreground">{t('approachHint')}</p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="boundaries">{t('boundaries')}</Label>
                            <Textarea
                                id="boundaries"
                                value={boundaries}
                                onChange={(e) => setBoundaries(e.target.value)}
                                placeholder={t('boundariesPlaceholder')}
                                rows={3}
                            />
                            <p className="text-xs text-muted-foreground">{t('boundariesHint')}</p>
                        </div>
                    </>
                )}

                <Button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="w-full"
                >
                    {isSaving ? (
                        <>
                            <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
                            {t('saving')}
                        </>
                    ) : (
                        <>
                            <IconDeviceFloppy className="mr-2 h-4 w-4" />
                            {t('save')}
                        </>
                    )}
                </Button>
            </CardContent>
        </Card>
    )
}
