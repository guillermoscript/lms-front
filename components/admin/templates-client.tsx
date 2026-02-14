"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { IconTemplate } from "@tabler/icons-react"
import { TemplatesList } from "@/components/admin/templates-list"
import { CreateTemplateButton } from "@/components/admin/create-template-button"

type TemplateCategory = 'system' | 'course' | 'payment' | 'enrollment' | 'exam' | 'custom'

type NotificationTemplate = {
  id: number
  name: string
  title: string
  content: string
  category: TemplateCategory
  variables: string[]
  created_at: string
  updated_at: string
}

interface TemplatesClientProps {
  templates: NotificationTemplate[]
}

export function TemplatesClient({ templates }: TemplatesClientProps) {
  const router = useRouter()
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplate | null>(null)

  // Group templates by category
  const templatesByCategory = templates?.reduce((acc: any, template: any) => {
    if (!acc[template.category]) {
      acc[template.category] = []
    }
    acc[template.category].push(template)
    return acc
  }, {}) || {}

  const handleEdit = (template: NotificationTemplate) => {
    setEditingTemplate(template)
  }

  const handleUse = (template: NotificationTemplate) => {
    // Navigate to notifications page with template data in query params
    const params = new URLSearchParams({
      template: template.name,
      title: template.title,
      content: template.content,
    })
    router.push(`/dashboard/admin/notifications?${params.toString()}`)
  }

  return (
    <>
      {/* Templates by Category */}
      <div className="space-y-6">
        {Object.keys(templatesByCategory).length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <IconTemplate className="mx-auto mb-4 h-12 w-12 opacity-50" />
              <p>No templates found</p>
              <p className="text-sm mt-2">Create your first template to get started</p>
            </CardContent>
          </Card>
        ) : (
          Object.entries(templatesByCategory).map(([category, categoryTemplates]) => (
            <Card key={category}>
              <CardHeader>
                <CardTitle className="capitalize">{category} Templates</CardTitle>
                <CardDescription>
                  {(categoryTemplates as any[]).length} template(s) in this category
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TemplatesList
                  templates={categoryTemplates as any[]}
                  onEdit={handleEdit}
                  onUse={handleUse}
                />
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Edit Template Dialog */}
      {editingTemplate && (
        <CreateTemplateButton
          template={editingTemplate}
          mode="edit"
        />
      )}
    </>
  )
}
