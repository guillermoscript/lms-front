'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { IconPlus, IconTrash, IconDeviceFloppy, IconLoader2, IconSparkles, IconInfoCircle } from '@tabler/icons-react'
import { toast } from 'sonner'
import { VersionHistorySheet } from './version-history-sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface TemplateFormProps {
  initialData?: any
  id?: string
}

export function TemplateForm({ initialData, id }: TemplateFormProps) {
  const router = useRouter()
  const t = useTranslations('dashboard.teacher.templateForm')
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    description: initialData?.description || '',
    category: initialData?.category || 'exercise',
    task_description_template: initialData?.task_description_template || '',
    system_prompt_template: initialData?.system_prompt_template || '',
    variables: initialData?.variables?.variables || [] as string[],
  })

  const [newVariable, setNewVariable] = useState('')

  const handleAddVariable = () => {
    if (!newVariable) return
    const variable = newVariable.trim().toLowerCase().replace(/\s+/g, '_')
    if (formData.variables.includes(variable)) {
      toast.error(t('variableExists'))
      return
    }
    setFormData({
      ...formData,
      variables: [...formData.variables, variable],
    })
    setNewVariable('')
  }

  const handleRemoveVariable = (variable: string) => {
    setFormData({
      ...formData,
      variables: formData.variables.filter((v: string) => v !== variable),
    })
  }

  const handleSave = async () => {
    if (!formData.name) {
      toast.error(t('nameRequired'))
      return
    }

    setLoading(true)
    try {
      const url = id ? `/api/teacher/templates/${id}` : '/api/teacher/templates'
      const method = id ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          variables: { variables: formData.variables },
        }),
      })

      if (res.ok) {
        toast.success(id ? t('updateSuccess') : t('createSuccess'))
        router.push('/dashboard/teacher/templates')
        router.refresh()
      } else {
        const data = await res.json()
        throw new Error(data.error || t('saveError'))
      }
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  const renderPreview = (text: string) => {
    if (!text) return <p className="text-muted-foreground italic">{t('noContent')}</p>
    
    let highlighted = text
    formData.variables.forEach((v: string) => {
      highlighted = highlighted.replace(
        new RegExp(`{{${v}}}`, 'g'),
        `<span class="bg-primary/20 text-primary px-1 rounded font-mono text-xs">{{${v}}}</span>`
      )
    })

    return (
      <div 
        className="whitespace-pre-wrap text-sm"
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    )
  }

  return (
    <div className="space-y-6">
      {id && (
        <div className="flex justify-end">
          <VersionHistorySheet
            contentType="prompt_template"
            contentId={parseInt(id)}
            currentSnapshot={formData}
            onRestore={() => router.refresh()}
          />
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('basicInfo')}</CardTitle>
            <CardDescription>{t('basicInfoDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('nameLabel')}</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t('namePlaceholder')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">{t('categoryLabel')}</Label>
              <Select
                value={formData.category}
                onValueChange={(val) => setFormData({ ...formData, category: val })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lesson_task">{t('categoryLessonTask')}</SelectItem>
                  <SelectItem value="exercise">{t('categoryExercise')}</SelectItem>
                  <SelectItem value="exam_grading">{t('categoryExamGrading')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t('descriptionLabel')}</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={t('descriptionPlaceholder')}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              {t('variables')}
              <IconInfoCircle size={16} className="text-muted-foreground" />
            </CardTitle>
            <CardDescription>{t('variablesDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={newVariable}
                onChange={(e) => setNewVariable(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddVariable()}
                placeholder={t('variablePlaceholder')}
              />
              <Button type="button" onClick={handleAddVariable} variant="secondary">
                <IconPlus size={18} />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.variables.map((variable: string) => (
                <Badge key={variable} variant="secondary" className="gap-1 py-1 pr-1">
                  {variable}
                  <button
                    onClick={() => handleRemoveVariable(variable)}
                    className="hover:text-destructive transition-colors"
                    aria-label={t('removeVariable')}
                  >
                    <IconTrash size={14} />
                  </button>
                </Badge>
              ))}
              {formData.variables.length === 0 && (
                <p className="text-sm text-muted-foreground italic">{t('noVariables')}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={loading} className="flex-1 gap-2">
            {loading ? (
              <IconLoader2 className="motion-safe:animate-spin" size={18} />
            ) : (
              <IconDeviceFloppy size={18} />
            )}
            {id ? t('update') : t('create')}
          </Button>
          <Button variant="outline" onClick={() => router.back()}>
            {t('cancel')}
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        <Tabs defaultValue="instructions">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="instructions">{t('instructionsTab')}</TabsTrigger>
            <TabsTrigger value="system">{t('systemPromptTab')}</TabsTrigger>
          </TabsList>
          
          <TabsContent value="instructions" className="space-y-6 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>{t('instructionsTitle')}</CardTitle>
                <CardDescription>{t('instructionsDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={formData.task_description_template}
                  onChange={(e) => setFormData({ ...formData, task_description_template: e.target.value })}
                  placeholder={t('instructionsPlaceholder')}
                  rows={8}
                />
                <div className="space-y-2">
                  <Label className="text-xs uppercase text-muted-foreground tracking-wider">Live Preview</Label>
                  <div className="p-4 bg-muted rounded-lg border">
                    {renderPreview(formData.task_description_template)}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="system" className="space-y-6 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>{t('systemPromptTitle')}</CardTitle>
                <CardDescription>{t('systemPromptDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={formData.system_prompt_template}
                  onChange={(e) => setFormData({ ...formData, system_prompt_template: e.target.value })}
                  placeholder={t('systemPromptPlaceholder')}
                  rows={8}
                />
                <div className="space-y-2">
                  <Label className="text-xs uppercase text-muted-foreground tracking-wider">Live Preview</Label>
                  <div className="p-4 bg-muted rounded-lg border">
                    {renderPreview(formData.system_prompt_template)}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
    </div>
  )
}
