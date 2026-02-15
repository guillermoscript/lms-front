"use client"

import { useState } from "react"
import { IconTrash, IconEdit, IconCopy } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { deleteNotificationTemplate } from "@/app/actions/admin/notification-templates"
import { toast } from "sonner"
import { useTranslations } from "next-intl"

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

interface TemplatesListProps {
  templates: NotificationTemplate[]
  onEdit: (template: NotificationTemplate) => void
  onUse: (template: NotificationTemplate) => void
}

export function TemplatesList({ templates, onEdit, onUse }: TemplatesListProps) {
  const t = useTranslations('dashboard.admin.notifications')
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    if (!deleteId) return

    setIsDeleting(true)
    try {
      const result = await deleteNotificationTemplate(deleteId)

      if (result.success) {
        toast.success(t('templates.form.toasts.deleted'))
        setDeleteId(null)
        // Refresh the page to update the list
        window.location.reload()
      } else {
        toast.error(result.error || t('templates.form.toasts.error'))
      }
    } catch (error) {
      toast.error(t('templates.form.toasts.error'))
    } finally {
      setIsDeleting(false)
    }
  }

  if (templates.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <p className="text-muted-foreground text-center">
            {t('templates.empty')}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <Card key={template.id} className="flex flex-col">
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-lg truncate">{template.name}</CardTitle>
                  <CardDescription className="mt-1 truncate">
                    {template.title}
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="shrink-0">
                  {template.category}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex-1">
              <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
                {template.content}
              </p>
              {template.variables && template.variables.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t('templates.form.content')} Variables:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {template.variables.map((variable) => (
                      <Badge
                        key={variable}
                        variant="outline"
                        className="text-xs font-mono"
                      >
                        {`{{${variable}}}`}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex gap-2 border-t pt-4">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => onUse(template)}
              >
                <IconCopy className="h-4 w-4 mr-1" />
                {t('templates.table.actions')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEdit(template)}
              >
                <IconEdit className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteId(template.id)}
                className="text-destructive hover:text-destructive"
              >
                <IconTrash className="h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('templates.form.dialog.editTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('list.confirmDelete')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t('templates.back')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "..." : t('list.actions.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
