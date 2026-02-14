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
      toast.error("Please fill in all required fields")
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
            ? "Template updated successfully"
            : "Template created successfully"
        )
        setOpen(false)
        // Reset form
        setName("")
        setTitle("")
        setContent("")
        setCategory("")
        setVariablesInput("")
        // Refresh the page to update the list
        window.location.reload()
      } else {
        toast.error(result.error || "Failed to save template")
      }
    } catch (error) {
      toast.error("An error occurred while saving the template")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button>
          {mode === "edit" ? (
            <>Edit Template</>
          ) : (
            <>
              <IconPlus className="h-4 w-4 mr-2" />
              Create Template
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? "Edit Template" : "Create Notification Template"}
          </DialogTitle>
          <DialogDescription>
            Create a reusable template for notifications. Use{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">
              {"{{variable}}"}
            </code>{" "}
            syntax for dynamic content.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Template Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., welcome_student"
              required
            />
            <p className="text-xs text-muted-foreground">
              Unique identifier for this template (lowercase, underscores)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category *</Label>
            <Select value={category} onValueChange={(value) => setCategory(value as TemplateCategory | "")} required>
              <SelectTrigger id="category">
                <SelectValue placeholder="Select a category" />
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
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Welcome to {{platform_name}}!"
              required
            />
            <p className="text-xs text-muted-foreground">
              The notification title (can include variables)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Content *</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="e.g., Hi {{user_name}}, welcome to our platform! We're excited to have you here."
              rows={6}
              required
            />
            <p className="text-xs text-muted-foreground">
              The notification message content (supports variables)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="variables">Variables (optional)</Label>
            <Input
              id="variables"
              value={variablesInput}
              onChange={(e) => setVariablesInput(e.target.value)}
              placeholder="e.g., user_name, course_title, date"
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated list of variables (auto-detected if not specified)
            </p>
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
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? mode === "edit"
                  ? "Updating..."
                  : "Creating..."
                : mode === "edit"
                  ? "Update Template"
                  : "Create Template"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
