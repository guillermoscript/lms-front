'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { IconTemplate, IconSparkles, IconArrowRight, IconCheck, IconAlertCircle, IconArrowLeft, IconEye, IconSettings } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

interface Template {
  id: number
  name: string
  description: string
  category: string
  task_description_template: string
  system_prompt_template: string
  variables: { variables: string[] }
  is_system: boolean
}

interface ImprovedTemplateSelectorProps {
  category: 'lesson_task' | 'exercise' | 'exam_grading'
  onApply: (data: { instructions: string; system_prompt: string }) => void
}

export function ImprovedTemplateSelector({ category, onApply }: ImprovedTemplateSelectorProps) {
  const t = useTranslations('dashboard.teacher.templateSelector')
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'select' | 'customize'>('select')
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [loading, setLoading] = useState(false)
  const [variableValues, setVariableValues] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [previewMode, setPreviewMode] = useState(false)

  useEffect(() => {
    if (open) {
      loadTemplates()
    }
  }, [open, category])

  useEffect(() => {
    if (selectedTemplate) {
      const initialValues: Record<string, string> = {}
      selectedTemplate.variables.variables.forEach((v) => {
        initialValues[v] = ''
      })
      setVariableValues(initialValues)
      setErrors({})
      setPreviewMode(false)
    }
  }, [selectedTemplate])

  const loadTemplates = async () => {
    setLoading(true)
    const params = new URLSearchParams({ category })
    const res = await fetch(`/api/teacher/templates?${params}`)
    const data = await res.json()
    setTemplates(data)
    setLoading(false)
  }

  const handleTemplateSelect = (template: Template) => {
    setSelectedTemplate(template)
    setStep('customize')
  }

  const replaceVariables = (text: string | null): string => {
    if (!text) return ''
    let result = text
    Object.entries(variableValues).forEach(([key, value]) => {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), value)
    })
    return result
  }

  const validateVariables = (): boolean => {
    const newErrors: Record<string, string> = {}
    selectedTemplate?.variables.variables.forEach((v) => {
      if (!variableValues[v] || variableValues[v].trim() === '') {
        newErrors[v] = t('fieldRequired')
      }
    })
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleApply = () => {
    if (!validateVariables()) return

    const instructions = replaceVariables(selectedTemplate?.task_description_template ?? null)
    const system_prompt = replaceVariables(selectedTemplate?.system_prompt_template ?? null)

    onApply({ instructions, system_prompt })
    handleClose()
  }

  const handleClose = () => {
    setOpen(false)
    setTimeout(() => {
      setStep('select')
      setSelectedTemplate(null)
      setVariableValues({})
      setErrors({})
      setPreviewMode(false)
    }, 200)
  }

  const hasVariables = selectedTemplate && selectedTemplate.variables.variables.length > 0
  const allVariablesFilled = hasVariables
    ? Object.values(variableValues).every(v => v.trim() !== '')
    : true

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="gap-2"
      >
        <IconTemplate className="h-4 w-4" />
        {t('useTemplate')}
      </Button>

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="!max-w-[90vw] !w-[1000px] h-[85vh] max-h-[800px] p-0 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {step === 'customize' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStep('select')
                    setSelectedTemplate(null)
                  }}
                  className="gap-1.5 -ml-2 text-muted-foreground hover:text-foreground"
                >
                  <IconArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <div className="w-9 h-9 rounded-lg bg-violet-500/10 flex items-center justify-center">
                <IconTemplate className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <DialogHeader className="p-0 space-y-0">
                  <DialogTitle className="text-base font-semibold leading-none">
                    {step === 'select' ? t('titleChoose') : selectedTemplate?.name}
                  </DialogTitle>
                </DialogHeader>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {step === 'select' ? t('description') : (
                    hasVariables
                      ? `${selectedTemplate?.variables.variables.length} variables to configure`
                      : 'Ready to apply'
                  )}
                </p>
              </div>
            </div>

            {step === 'customize' && hasVariables && (
              <div className="flex items-center border rounded-lg p-0.5 bg-muted/50">
                <button
                  onClick={() => setPreviewMode(false)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                    'outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    !previewMode
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <IconSettings className="h-3.5 w-3.5" />
                  Configure
                </button>
                <button
                  onClick={() => setPreviewMode(true)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                    'outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    previewMode
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <IconEye className="h-3.5 w-3.5" />
                  Preview
                </button>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0">
            {step === 'select' && (
              <ScrollArea className="h-full">
                <div className="p-6">
                  {loading ? (
                    <div className="text-center py-16 text-muted-foreground">{t('loading')}</div>
                  ) : templates.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                      <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center">
                        <IconAlertCircle className="h-7 w-7 text-muted-foreground/40" />
                      </div>
                      <p className="text-sm text-muted-foreground">{t('noTemplates')}</p>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {templates.map((template) => (
                        <button
                          key={template.id}
                          className="group text-left p-5 rounded-xl border bg-background hover:border-primary/50 hover:shadow-md transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          onClick={() => handleTemplateSelect(template)}
                        >
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-semibold text-sm truncate">{template.name}</h4>
                                {template.is_system && (
                                  <Badge variant="secondary" className="gap-1 text-[10px] shrink-0">
                                    <IconSparkles className="h-2.5 w-2.5" />
                                    {t('system')}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                                {template.description}
                              </p>
                            </div>
                            <IconArrowRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary transition-colors shrink-0 mt-0.5" />
                          </div>
                          {template.variables.variables.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-3 border-t">
                              {template.variables.variables.map((v) => (
                                <span
                                  key={v}
                                  className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-muted/60 border text-muted-foreground"
                                >
                                  {`{{${v}}}`}
                                </span>
                              ))}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}

            {step === 'customize' && selectedTemplate && (
              <ScrollArea className="h-full">
                <div className="p-6">
                  {/* Configure mode */}
                  {!previewMode && (
                    <div className="max-w-2xl mx-auto space-y-6">
                      {hasVariables ? (
                        <>
                          <div className="bg-muted/30 p-4 rounded-xl border">
                            <p className="text-sm">
                              {t('requiresInfo', { name: selectedTemplate.name })}
                            </p>
                          </div>

                          <div className="space-y-5">
                            {selectedTemplate.variables.variables.map((variable) => (
                              <div key={variable} className="space-y-2">
                                <Label htmlFor={variable} className="flex items-center gap-2 text-sm font-medium">
                                  {variable.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                                  <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                  id={variable}
                                  value={variableValues[variable] || ''}
                                  onChange={(e) => {
                                    setVariableValues({ ...variableValues, [variable]: e.target.value })
                                    if (errors[variable]) {
                                      setErrors({ ...errors, [variable]: '' })
                                    }
                                  }}
                                  placeholder={t('enterPlaceholder', { field: variable.replace(/_/g, ' ') })}
                                  className={cn(
                                    'h-11',
                                    errors[variable] ? 'border-destructive' : ''
                                  )}
                                />
                                {errors[variable] && (
                                  <p className="text-sm text-destructive">{errors[variable]}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                            <IconCheck className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <div className="space-y-1">
                            <p className="text-base font-medium">{t('noVariablesMsg')}</p>
                            <p className="text-sm text-muted-foreground">
                              Click apply to use this template as-is.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Preview mode */}
                  {previewMode && (
                    <div className="max-w-3xl mx-auto space-y-6">
                      {selectedTemplate.task_description_template && (
                        <div className="space-y-2.5">
                          <Label className="text-sm font-semibold">{t('studentPreviewTitle')}</Label>
                          <div className="rounded-xl border bg-[#1e1e2e] p-5">
                            <p className="text-sm whitespace-pre-wrap font-mono leading-relaxed text-[#cdd6f4]">
                              {replaceVariables(selectedTemplate.task_description_template)}
                            </p>
                            {hasVariables && !allVariablesFilled && (
                              <p className="text-xs text-amber-400/70 mt-4 italic border-t border-white/5 pt-3">
                                {t('fillAllVariables')}
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      {selectedTemplate.system_prompt_template && (
                        <div className="space-y-2.5">
                          <Label className="text-sm font-semibold">{t('aiPreviewTitle')}</Label>
                          <div className="rounded-xl border bg-[#1e1e2e] p-5">
                            <p className="text-sm whitespace-pre-wrap font-mono leading-relaxed text-[#cdd6f4]">
                              {replaceVariables(selectedTemplate.system_prompt_template)}
                            </p>
                            {hasVariables && !allVariablesFilled && (
                              <p className="text-xs text-amber-400/70 mt-4 italic border-t border-white/5 pt-3">
                                {t('fillAllVariables')}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}
          </div>

          {/* Footer */}
          {step === 'customize' && selectedTemplate && (
            <div className="border-t px-6 py-4 flex items-center justify-between shrink-0 bg-muted/5">
              <Button variant="ghost" onClick={handleClose} className="text-muted-foreground">
                {t('cancel')}
              </Button>
              <Button onClick={handleApply} className="gap-2 px-6">
                <IconCheck className="h-4 w-4" />
                {t('applyTemplate')}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
