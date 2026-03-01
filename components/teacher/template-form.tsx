'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
      toast.error('Variable already exists')
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
      toast.error('Template name is required')
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
        toast.success(id ? 'Template updated' : 'Template created')
        router.push('/dashboard/teacher/templates')
        router.refresh()
      } else {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save')
      }
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  const renderPreview = (text: string) => {
    if (!text) return <p className="text-muted-foreground italic">No content</p>
    
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
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>Give your template a name and category</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Template Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Grammar Assistant"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select
                value={formData.category}
                onValueChange={(val) => setFormData({ ...formData, category: val })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lesson_task">Lesson Task</SelectItem>
                  <SelectItem value="exercise">Exercise</SelectItem>
                  <SelectItem value="exam_grading">Exam Grading</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="What is this template for?"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Variables
              <IconInfoCircle size={16} className="text-muted-foreground" />
            </CardTitle>
            <CardDescription>Define placeholders like {"{{topic}}"} to use in your templates</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={newVariable}
                onChange={(e) => setNewVariable(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddVariable()}
                placeholder="variable_name"
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
                  >
                    <IconTrash size={14} />
                  </button>
                </Badge>
              ))}
              {formData.variables.length === 0 && (
                <p className="text-sm text-muted-foreground italic">No variables added yet</p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={loading} className="flex-1 gap-2">
            {loading ? (
              <IconLoader2 className="animate-spin" size={18} />
            ) : (
              <IconDeviceFloppy size={18} />
            )}
            {id ? 'Update Template' : 'Create Template'}
          </Button>
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        <Tabs defaultValue="instructions">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="instructions">Instructions</TabsTrigger>
            <TabsTrigger value="system">System Prompt</TabsTrigger>
          </TabsList>
          
          <TabsContent value="instructions" className="space-y-6 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Student-Facing Instructions</CardTitle>
                <CardDescription>This is what the student will see. Use {"{{variable}}"} syntax.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={formData.task_description_template}
                  onChange={(e) => setFormData({ ...formData, task_description_template: e.target.value })}
                  placeholder="e.g. Write a short essay about {{topic}}..."
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
                <CardTitle>AI System Instructions</CardTitle>
                <CardDescription>Internal instructions for the AI model. Use {"{{variable}}"} syntax.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={formData.system_prompt_template}
                  onChange={(e) => setFormData({ ...formData, system_prompt_template: e.target.value })}
                  placeholder="e.g. You are a helpful assistant evaluating an essay about {{topic}}..."
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
