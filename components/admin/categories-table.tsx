'use client'

import { useTranslations } from 'next-intl'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { IconPlus, IconEdit, IconTrash } from '@tabler/icons-react'
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
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b">
            <tr className="text-left text-sm text-muted-foreground">
              <th className="pb-3 font-medium">{t('table.headers.name')}</th>
              <th className="pb-3 font-medium">{t('table.headers.description')}</th>
              <th className="pb-3 font-medium">{t('table.headers.courses')}</th>
              <th className="pb-3 font-medium">{t('table.headers.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {categories.length > 0 ? (
              categories.map((category) => {
                const courseCount = getCourseCount(category)

                return (
                  <tr key={category.id} className="text-sm">
                    <td className="py-4">
                      <p className="font-medium">{category.name}</p>
                    </td>
                    <td className="py-4">
                      <p className="text-muted-foreground max-w-md truncate">
                        {category.description || t('table.noDescription')}
                      </p>
                    </td>
                    <td className="py-4">
                      <Badge variant="outline">
                        {t('table.courseCount', { count: courseCount })}
                      </Badge>
                    </td>
                    <td className="py-4">
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingCategory(category)}
                        >
                          <IconEdit className="mr-1 h-4 w-4" />
                          {t('table.actions.edit')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingCategory(category)}
                          className="text-destructive hover:text-destructive"
                        >
                          <IconTrash className="mr-1 h-4 w-4" />
                          {t('table.actions.delete')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })
            ) : (
              <tr>
                <td colSpan={4} className="py-8 text-center text-muted-foreground">
                  {t('table.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
