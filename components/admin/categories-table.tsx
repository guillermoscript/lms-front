'use client'

import { useTranslations } from 'next-intl'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconDots,
  IconCategory,
} from '@tabler/icons-react'
import { CategoryFormDialog } from './category-form-dialog'
import { ConfirmDialog } from './confirm-dialog'
import { deleteCategory } from '@/app/actions/admin/categories'

interface Category {
  id: number
  name: string
  description: string | null
  courses: { count: number }[]
}

interface CategoriesTableProps {
  categories: Category[]
}

export function CategoriesTable({ categories }: CategoriesTableProps) {
  const t = useTranslations('dashboard.admin.categories')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleDelete = async () => {
    if (!deletingCategory) return

    setLoading(true)
    const result = await deleteCategory(deletingCategory.id)

    if (result.success) {
      toast.success(t('toasts.deleteSuccess', { name: deletingCategory.name }))
      setDeletingCategory(null)
      router.refresh()
    } else {
      toast.error(result.error || t('toasts.deleteError'))
    }

    setLoading(false)
  }

  const getCourseCount = (category: Category) => {
    return category.courses?.[0]?.count || 0
  }

  return (
    <>
      {/* Header with Create Button */}
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setShowCreateDialog(true)}>
          <IconPlus className="mr-2 h-4 w-4" />
          {t('table.addCategory')}
        </Button>
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('table.headers.name')}</TableHead>
              <TableHead>{t('table.headers.description')}</TableHead>
              <TableHead>{t('table.headers.courses')}</TableHead>
              <TableHead className="text-right">{t('table.headers.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.length > 0 ? (
              categories.map((category) => {
                const courseCount = getCourseCount(category)

                return (
                  <TableRow key={category.id}>
                    <TableCell>
                      <p className="font-medium">{category.name}</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-muted-foreground max-w-md truncate">
                        {category.description || t('table.noDescription')}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {t('table.courseCount', { count: courseCount })}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingCategory(category)}
                        >
                          <IconEdit className="mr-1 h-4 w-4" />
                          {t('table.actions.edit')}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={t('table.headers.actions')}
                              >
                                <IconDots className="h-4 w-4" />
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setDeletingCategory(category)}
                              className="text-destructive"
                            >
                              <IconTrash className="mr-2 h-4 w-4" />
                              {t('table.actions.delete')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="h-32 text-center">
                  <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                    <IconCategory className="h-8 w-8" />
                    <p>{t('table.empty')}</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create Dialog */}
      <CategoryFormDialog
        open={showCreateDialog}
        onOpenChange={(open) => {
          setShowCreateDialog(open)
          if (!open) router.refresh()
        }}
        mode="create"
      />

      {/* Edit Dialog */}
      {editingCategory && (
        <CategoryFormDialog
          open={!!editingCategory}
          onOpenChange={(open) => {
            if (!open) setEditingCategory(null)
            router.refresh()
          }}
          mode="edit"
          initialData={editingCategory}
        />
      )}

      {/* Delete Confirmation */}
      {deletingCategory && (
        <ConfirmDialog
          open={!!deletingCategory}
          onOpenChange={(open) => {
            if (!open) setDeletingCategory(null)
          }}
          title={t('dialogs.delete.title')}
          description={
            getCourseCount(deletingCategory) > 0
              ? t('dialogs.delete.cannotDelete', {
                name: deletingCategory.name,
                count: getCourseCount(deletingCategory),
              })
              : t('dialogs.delete.description', { name: deletingCategory.name })
          }
          confirmText={t('dialogs.delete.confirm')}
          variant="destructive"
          onConfirm={handleDelete}
        />
      )}
    </>
  )
}
