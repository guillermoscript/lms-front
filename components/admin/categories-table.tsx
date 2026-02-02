'use client'

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
      toast.success(`Category "${deletingCategory.name}" deleted`)
      setDeletingCategory(null)
      router.refresh()
    } else {
      toast.error(result.error || 'Failed to delete category')
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
          Add Category
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b">
            <tr className="text-left text-sm text-muted-foreground">
              <th className="pb-3 font-medium">Name</th>
              <th className="pb-3 font-medium">Description</th>
              <th className="pb-3 font-medium">Courses</th>
              <th className="pb-3 font-medium">Actions</th>
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
                        {category.description || 'No description'}
                      </p>
                    </td>
                    <td className="py-4">
                      <Badge variant="outline">
                        {courseCount} {courseCount === 1 ? 'course' : 'courses'}
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
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingCategory(category)}
                          className="text-destructive hover:text-destructive"
                        >
                          <IconTrash className="mr-1 h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })
            ) : (
              <tr>
                <td colSpan={4} className="py-8 text-center text-muted-foreground">
                  No categories found. Create your first category to get started.
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
          title="Delete Category"
          description={
            getCourseCount(deletingCategory) > 0
              ? `Cannot delete "${deletingCategory.name}" because ${getCourseCount(deletingCategory)} ${getCourseCount(deletingCategory) === 1 ? 'course is' : 'courses are'} using it. Please reassign or delete those courses first.`
              : `Are you sure you want to delete "${deletingCategory.name}"? This action cannot be undone.`
          }
          confirmText="Delete"
          variant="destructive"
          onConfirm={handleDelete}
        />
      )}
    </>
  )
}
