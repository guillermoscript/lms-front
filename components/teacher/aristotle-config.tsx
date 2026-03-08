'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
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
    } | null
}

export function AristotleConfig({ courseId, tenantId, initialConfig }: AristotleConfigProps) {
    const [enabled, setEnabled] = useState(initialConfig?.enabled ?? false)
    const [persona, setPersona] = useState(initialConfig?.persona ?? '')
    const [teachingApproach, setTeachingApproach] = useState(initialConfig?.teaching_approach ?? '')
    const [boundaries, setBoundaries] = useState(initialConfig?.boundaries ?? '')
    const [isSaving, setIsSaving] = useState(false)
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
                    })

                if (error) throw error
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
