'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
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
import { ConfirmDialog } from '@/components/admin/confirm-dialog'

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
  const t = useTranslations('dashboard.teacher.templates')
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [deleteId, setDeleteId] = useState<number | null>(null)

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
      toast.error(t('loadError'))
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/teacher/templates/${id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        toast.success(t('deleteSuccess'))
        fetchTemplates()
      } else {
        throw new Error('Failed to delete')
      }
    } catch (error) {
      toast.error(t('deleteError'))
    } finally {
      setDeleteId(null)
    }
  }

  const handleDuplicate = async (template: Template) => {
    try {
      const res = await fetch('/api/teacher/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${template.name} (${t('copySuffix')})`,
          description: template.description,
          category: template.category,
          task_description_template: template.task_description_template,
          system_prompt_template: template.system_prompt_template,
          variables: template.variables,
        }),
      })
      if (res.ok) {
        toast.success(t('duplicateSuccess'))
        fetchTemplates()
      }
    } catch (error) {
      toast.error(t('duplicateError'))
    }
  }

  const filteredTemplates = templates.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.description.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex-1 space-y-6 p-6 lg:p-8" data-testid="templates-page">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('title')}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t('description')}
          </p>
        </div>
        <Link href="/dashboard/teacher/templates/new">
          <Button size="sm" className="gap-2">
            <IconPlus size={16} />
            {t('createTemplate')}
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('yourTemplates')}</CardTitle>
          <CardDescription>
            {t('yourTemplatesDescription')}
          </CardDescription>
          <div className="relative mt-3">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder={t('searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-8 max-w-sm text-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px] uppercase tracking-wider">{t('table.name')}</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider">{t('table.category')}</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider">{t('table.variables')}</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider">{t('table.created')}</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider w-[80px]">{t('table.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">
                    {t('loading')}
                  </TableCell>
                </TableRow>
              ) : filteredTemplates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">
                    {t('noTemplates')}
                  </TableCell>
                </TableRow>
              ) : (
                filteredTemplates.map((template) => (
                  <TableRow key={template.id} className="hover:bg-muted/40">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{template.name}</span>
                        {template.is_system && (
                          <Badge variant="secondary" className="gap-1 text-[10px]">
                            <IconSparkles size={10} />
                            {t('system')}
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground/70 line-clamp-1 mt-0.5">
                        {template.description}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {template.category.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {template.variables.variables.map((v) => (
                          <Badge key={v} variant="secondary" className="text-[9px] px-1.5 h-4 font-mono">
                            {v}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs tabular-nums text-muted-foreground">
                      {new Date(template.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger>
                          <Button variant="ghost" size="icon-xs" aria-label={t('table.actions')}>
                            <IconDotsVertical size={14} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => router.push(`/dashboard/teacher/templates/${template.id}/edit`)} className="flex items-center gap-2 text-sm">
                            <IconEdit size={14} />
                            {t('editAction')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicate(template)} className="flex items-center gap-2 text-sm">
                            <IconCopy size={14} />
                            {t('duplicateAction')}
                          </DropdownMenuItem>
                          {!template.is_system && (
                            <DropdownMenuItem
                              onClick={() => setDeleteId(template.id)}
                              className="flex items-center gap-2 text-sm text-destructive focus:text-destructive"
                            >
                              <IconTrash size={14} />
                              {t('deleteAction')}
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

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => { if (!open) setDeleteId(null) }}
        title={t('deleteConfirmTitle')}
        description={t('deleteConfirmDescription')}
        confirmText={t('deleteAction')}
        variant="destructive"
        onConfirm={() => deleteId !== null && handleDelete(deleteId)}
      />
    </div>
  )
}
