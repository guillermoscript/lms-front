'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { IconTemplate, IconSearch, IconSparkles } from '@tabler/icons-react'

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

interface PromptTemplateSelectorProps {
  category: 'lesson_task' | 'exercise' | 'exam_grading'
  onSelect: (template: Template) => void
}

export function PromptTemplateSelector({ category, onSelect }: PromptTemplateSelectorProps) {
  const [open, setOpen] = useState(false)
  const [templates, setTemplates] = useState<Template[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      loadTemplates()
    }
  }, [open, category])

  const loadTemplates = async () => {
    setLoading(true)
    const params = new URLSearchParams({ category })
    if (search) params.append('search', search)

    const res = await fetch(`/api/teacher/templates?${params}`)
    const data = await res.json()
    setTemplates(data)
    setLoading(false)
  }

  const handleSelect = (template: Template) => {
    onSelect(template)
    setOpen(false)
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="gap-2"
      >
        <IconTemplate className="h-4 w-4" />
        Browse Templates
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select a Prompt Template</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="search">Search Templates</Label>
              <div className="relative">
                <IconSearch className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name..."
                  className="pl-10"
                />
              </div>
            </div>

            <Button onClick={loadTemplates} disabled={loading} className="w-full">
              {loading ? 'Loading...' : 'Search'}
            </Button>

            <div className="grid gap-4">
              {templates.map((template) => (
                <Card key={template.id} className="cursor-pointer hover:border-primary" onClick={() => handleSelect(template)}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {template.name}
                          {template.is_system && (
                            <IconSparkles className="h-4 w-4 text-primary" />
                          )}
                        </CardTitle>
                        <CardDescription>{template.description}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div>
                        <strong>Variables:</strong> {template.variables.variables.join(', ')}
                      </div>
                      <div className="bg-muted p-3 rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">Preview:</p>
                        <p className="line-clamp-2">{template.task_description_template || template.system_prompt_template}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
