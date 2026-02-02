'use server'

import { revalidatePath } from 'next/cache'
import { verifyAdminAccess, createAdminClient, type ActionResult } from '@/lib/supabase/admin'

interface Category {
  id: number
  name: string
  description?: string
}

/**
 * Creates a new course category
 */
export async function createCategory(
  name: string,
  description?: string
): Promise<ActionResult<Category>> {
  try {
    await verifyAdminAccess()

    if (!name || name.trim().length === 0) {
      throw new Error('Category name is required')
    }

    const adminClient = createAdminClient()

    const { data, error } = await adminClient
      .from('course_categories')
      .insert({
        name: name.trim(),
        description: description?.trim() || null
      })
      .select()
      .single()

    if (error) throw error

    revalidatePath('/dashboard/admin/categories')
    revalidatePath('/dashboard/admin/courses')

    return { success: true, data }
  } catch (error) {
    console.error('Create category failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create category'
    }
  }
}

/**
 * Updates an existing category
 */
export async function updateCategory(
  categoryId: number,
  name: string,
  description?: string
): Promise<ActionResult> {
  try {
    await verifyAdminAccess()

    if (!categoryId) {
      throw new Error('Category ID is required')
    }

    if (!name || name.trim().length === 0) {
      throw new Error('Category name is required')
    }

    const adminClient = createAdminClient()

    const { error } = await adminClient
      .from('course_categories')
      .update({
        name: name.trim(),
        description: description?.trim() || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', categoryId)

    if (error) throw error

    revalidatePath('/dashboard/admin/categories')
    revalidatePath('/dashboard/admin/courses')

    return { success: true }
  } catch (error) {
    console.error('Update category failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update category'
    }
  }
}

/**
 * Deletes a category (only if no courses are using it)
 */
export async function deleteCategory(categoryId: number): Promise<ActionResult> {
  try {
    await verifyAdminAccess()

    if (!categoryId) {
      throw new Error('Category ID is required')
    }

    const adminClient = createAdminClient()

    // Check if any courses use this category
    const { count, error: countError } = await adminClient
      .from('courses')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', categoryId)

    if (countError) throw countError

    if (count && count > 0) {
      return {
        success: false,
        error: `Cannot delete category. ${count} course${count > 1 ? 's are' : ' is'} using it.`
      }
    }

    // Delete the category
    const { error } = await adminClient
      .from('course_categories')
      .delete()
      .eq('id', categoryId)

    if (error) throw error

    revalidatePath('/dashboard/admin/categories')
    revalidatePath('/dashboard/admin/courses')

    return { success: true }
  } catch (error) {
    console.error('Delete category failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete category'
    }
  }
}
