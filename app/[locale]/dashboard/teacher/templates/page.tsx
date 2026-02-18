'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  IconPlus,
  IconTemplate,
  IconEdit,
  IconTrash,
  IconCopy,
  IconDotsVertical,
  IconSearch,
  IconSparkles,
} from '@tabler/icons-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

interface Template {
  id: number
  name: string
  description: string
  category: string
  task_description_template: string
  system_prompt_template: string
  variables: { variables: string[] }
  is_system: boolean
  created_at: string
}

export default function PromptTemplatesPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const supabase = createClient()

  useEffect(() => {
    fetchTemplates()
  }, [])

  const fetchTemplates = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/teacher/templates')
      const data = await res.json()
      setTemplates(data)
    } catch (error) {
      console.error('Error fetching templates:', error)
      toast.error('Failed to load templates')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this template?')) return

    try {
      const res = await fetch(`/api/teacher/templates/${id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        toast.success('Template deleted')
        fetchTemplates()
      } else {
        throw new Error('Failed to delete')
      }
    } catch (error) {
      toast.error('Error deleting template')
    }
  }

  const handleDuplicate = async (template: Template) => {
    try {
      const res = await fetch('/api/teacher/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${template.name} (Copy)`,
          description: template.description,
          category: template.category,
          task_description_template: template.task_description_template,
          system_prompt_template: template.system_prompt_template,
          variables: template.variables,
        }),
      })
      if (res.ok) {
        toast.success('Template duplicated')
        fetchTemplates()
      }
    } catch (error) {
      toast.error('Error duplicating template')
    }
  }

  const filteredTemplates = templates.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.description.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex-1 space-y-8 p-8 pt-6" data-testid="templates-page">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Prompt Templates</h2>
          <p className="text-muted-foreground">
            Manage your reusable AI prompt templates for lessons and exercises.
          </p>
        </div>
        <Link href="/dashboard/teacher/templates/new">
          <Button className="gap-2">
            <IconPlus size={18} />
            Create Template
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Templates</CardTitle>
          <CardDescription>
            System templates are available for everyone. You can edit or delete your own templates.
          </CardDescription>
          <div className="relative mt-2">
            <IconSearch className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search templates..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Variables</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    Loading templates...
                  </TableCell>
                </TableRow>
              ) : filteredTemplates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No templates found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredTemplates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell>
                      <div className="font-medium flex items-center gap-2">
                        {template.name}
                        {template.is_system && (
                          <Badge variant="secondary" className="gap-1">
                            <IconSparkles size={12} />
                            System
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground line-clamp-1">
                        {template.description}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {template.category.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {template.variables.variables.map((v) => (
                          <Badge key={v} variant="secondary" className="text-[10px] px-1 h-4">
                            {v}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(template.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <IconDotsVertical size={16} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => router.push(`/dashboard/teacher/templates/${template.id}/edit`)} className="flex items-center gap-2">
                            <IconEdit size={16} />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicate(template)} className="flex items-center gap-2">
                            <IconCopy size={16} />
                            Duplicate
                          </DropdownMenuItem>
                          {!template.is_system && (
                            <DropdownMenuItem
                              onClick={() => handleDelete(template.id)}
                              className="flex items-center gap-2 text-destructive focus:text-destructive"
                            >
                              <IconTrash size={16} />
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
