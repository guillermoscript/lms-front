"use client"

import { useState } from "react"
import { IconPlus } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { createNotificationTemplate, updateNotificationTemplate } from "@/app/actions/admin/notification-templates"
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
}

interface CreateTemplateButtonProps {
  template?: NotificationTemplate | null
  mode?: "create" | "edit"
}

const CATEGORIES: { value: TemplateCategory; label: string }[] = [
  { value: "system", label: "System" },
  { value: "course", label: "Course" },
  { value: "payment", label: "Payment" },
  { value: "enrollment", label: "Enrollment" },
  { value: "exam", label: "Exam" },
  { value: "custom", label: "Custom" },
]

export function CreateTemplateButton({ template, mode = "create" }: CreateTemplateButtonProps) {
  const t = useTranslations('dashboard.admin.notifications.templates')
  const [open, setOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [name, setName] = useState(template?.name || "")
  const [title, setTitle] = useState(template?.title || "")
  const [content, setContent] = useState(template?.content || "")
  const [category, setCategory] = useState<TemplateCategory | "">(template?.category || "")
  const [variablesInput, setVariablesInput] = useState(
    template?.variables?.join(", ") || ""
  )

  // Extract variables from content (find all {{variable}} patterns)
  const extractVariables = (text: string): string[] => {
    const regex = /\{\{(\w+)\}\}/g
    const matches = text.matchAll(regex)
    const vars = Array.from(matches, (m) => m[1])
    return Array.from(new Set(vars)) // Remove duplicates
  }

  // Auto-detect variables from content
  const detectedVariables = extractVariables(content)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim() || !title.trim() || !content.trim() || !category) {
      toast.error(t('form.toasts.error'))
      return
    }

    setIsSubmitting(true)

    try {
      // Parse variables from input (comma-separated) or use detected variables
      const inputVars = variablesInput
        .split(",")
        .map((v) => v.trim())
        .filter((v) => v.length > 0)

      const variables = inputVars.length > 0 ? inputVars : detectedVariables

      const templateData = {
        name: name.trim(),
        title: title.trim(),
        content: content.trim(),
        category,
        variables,
      }

      let result
      if (mode === "edit" && template?.id) {
        result = await updateNotificationTemplate(template.id, templateData)
      } else {
        result = await createNotificationTemplate(templateData)
      }

      if (result.success) {
        toast.success(
          mode === "edit"
            ? t('form.toasts.updated')
            : t('form.toasts.success')
        )
        setOpen(false)
        // Reset form
        if (mode === "create") {
          setName("")
          setTitle("")
          setContent("")
          setCategory("")
          setVariablesInput("")
        }
        // Refresh the page to update the list
        window.location.reload()
      } else {
        toast.error(result.error || t('form.toasts.error'))
      }
    } catch (error) {
      toast.error(t('form.toasts.error'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button>
          {mode === "edit" ? (
            <>{t('form.submit.update')}</>
          ) : (
            <>
              <IconPlus className="h-4 w-4 mr-2" />
              {t('create')}
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? t('form.dialog.editTitle') : t('form.dialog.title')}
          </DialogTitle>
          <DialogDescription>
            {t('form.dialog.description')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('form.name')} *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('form.namePlaceholder')}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">{t('form.type')} *</Label>
            <Select value={category} onValueChange={(value) => setCategory(value as TemplateCategory | "")} required>
              <SelectTrigger id="category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">{t('form.subject')} *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('form.subjectPlaceholder')}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">{t('form.content')} *</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t('form.contentPlaceholder')}
              rows={6}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="variables">Variables (optional)</Label>
            <Input
              id="variables"
              value={variablesInput}
              onChange={(e) => setVariablesInput(e.target.value)}
              placeholder="e.g., user_name, course_title, date"
            />
          </div>

          {detectedVariables.length > 0 && (
            <div className="rounded-lg border p-3 bg-muted/50">
              <p className="text-xs font-medium mb-2">Detected Variables:</p>
              <div className="flex flex-wrap gap-1">
                {detectedVariables.map((variable) => (
                  <Badge key={variable} variant="secondary" className="text-xs font-mono">
                    {`{{${variable}}}`}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <DialogClose>
              <Button type="button" variant="outline" disabled={isSubmitting}>
                {t('back')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? "..."
                : mode === "edit"
                  ? t('form.submit.update')
                  : t('form.submit.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
