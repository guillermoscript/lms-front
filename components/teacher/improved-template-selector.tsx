'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { IconTemplate, IconSparkles, IconArrowRight, IconCheck, IconAlertCircle } from '@tabler/icons-react'

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
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'select' | 'customize'>('select')
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [loading, setLoading] = useState(false)
  const [variableValues, setVariableValues] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open) {
      loadTemplates()
    }
  }, [open, category])

  useEffect(() => {
    if (selectedTemplate) {
      // Initialize variable values
      const initialValues: Record<string, string> = {}
      selectedTemplate.variables.variables.forEach((v) => {
        initialValues[v] = ''
      })
      setVariableValues(initialValues)
      setErrors({})
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
        newErrors[v] = 'This field is required'
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
    }, 200)
  }

  const hasVariables = selectedTemplate && selectedTemplate.variables.variables.length > 0

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="gap-2"
      >
        <IconTemplate className="h-4 w-4" />
        Use Template
      </Button>

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {step === 'select' ? 'Choose a Template' : 'Customize Template'}
              {step === 'customize' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStep('select')
                    setSelectedTemplate(null)
                  }}
                  className="ml-auto"
                >
                  ← Back to Templates
                </Button>
              )}
            </DialogTitle>
            {step === 'select' && (
              <DialogDescription>
                Select a pre-built template to quickly set up your exercise prompts
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            {step === 'select' && (
              <div className="space-y-4 py-4">
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading templates...</div>
                ) : templates.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <IconAlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No templates found
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {templates.map((template) => (
                      <Card
                        key={template.id}
                        className="cursor-pointer hover:border-primary hover:shadow-md transition-all"
                        onClick={() => handleTemplateSelect(template)}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <CardTitle className="flex items-center gap-2 text-base">
                                {template.name}
                                {template.is_system && (
                                  <Badge variant="secondary" className="gap-1">
                                    <IconSparkles className="h-3 w-3" />
                                    System
                                  </Badge>
                                )}
                              </CardTitle>
                              <CardDescription className="mt-1">{template.description}</CardDescription>
                            </div>
                            <IconArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                          </div>
                        </CardHeader>
                        {template.variables.variables.length > 0 && (
                          <CardContent className="pt-0">
                            <div className="flex flex-wrap gap-1">
                              <span className="text-xs text-muted-foreground mr-1">Variables:</span>
                              {template.variables.variables.map((v) => (
                                <Badge key={v} variant="outline" className="text-xs">
                                  {v}
                                </Badge>
                              ))}
                            </div>
                          </CardContent>
                        )}
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}

            {step === 'customize' && selectedTemplate && (
              <div className="py-4">
                <Tabs defaultValue="variables" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="variables">
                      {hasVariables ? 'Fill Variables' : 'No Variables'}
                    </TabsTrigger>
                    <TabsTrigger value="preview">Preview</TabsTrigger>
                  </TabsList>

                  <TabsContent value="variables" className="space-y-4 mt-4">
                    {hasVariables ? (
                      <>
                        <div className="bg-muted/50 p-4 rounded-lg border">
                          <p className="text-sm text-muted-foreground mb-3">
                            <strong>{selectedTemplate.name}</strong> requires the following information:
                          </p>
                        </div>

                        <div className="space-y-4">
                          {selectedTemplate.variables.variables.map((variable) => (
                            <div key={variable} className="space-y-2">
                              <Label htmlFor={variable} className="flex items-center gap-2">
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
                                placeholder={`Enter ${variable.replace(/_/g, ' ')}`}
                                className={errors[variable] ? 'border-destructive' : ''}
                              />
                              {errors[variable] && (
                                <p className="text-sm text-destructive">{errors[variable]}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <IconCheck className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        This template has no variables to configure. Click "Apply Template" to use it.
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="preview" className="space-y-4 mt-4">
                    {selectedTemplate.task_description_template && (
                      <div className="space-y-2">
                        <Label className="text-base font-semibold">Student Instructions (Preview)</Label>
                        <div className="bg-muted p-4 rounded-lg border">
                          <p className="text-sm whitespace-pre-wrap">
                            {replaceVariables(selectedTemplate.task_description_template)}
                          </p>
                          {hasVariables && Object.values(variableValues).some(v => !v) && (
                            <p className="text-xs text-muted-foreground mt-3 italic">
                              Fill in all variables to see the complete preview
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {selectedTemplate.system_prompt_template && (
                      <div className="space-y-2">
                        <Label className="text-base font-semibold">AI System Prompt (Preview)</Label>
                        <div className="bg-muted p-4 rounded-lg border">
                          <p className="text-sm whitespace-pre-wrap">
                            {replaceVariables(selectedTemplate.system_prompt_template)}
                          </p>
                          {hasVariables && Object.values(variableValues).some(v => !v) && (
                            <p className="text-xs text-muted-foreground mt-3 italic">
                              Fill in all variables to see the complete preview
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </div>

          {step === 'customize' && selectedTemplate && (
            <div className="border-t pt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleApply} className="gap-2">
                <IconCheck className="h-4 w-4" />
                Apply Template
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
