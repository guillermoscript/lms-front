'use server'

import { revalidatePath } from 'next/cache'
import { verifyAdminAccess, createAdminClient, type ActionResult } from '@/lib/supabase/admin'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { isSuperAdmin } from '@/lib/supabase/get-user-role'

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

    const tenantId = await getCurrentTenantId()

    if (!name || name.trim().length === 0) {
      throw new Error('Category name is required')
    }

    const adminClient = createAdminClient()

    const { data, error } = await adminClient
      .from('course_categories')
      .insert({
        name: name.trim(),
        description: description?.trim() || null,
        tenant_id: tenantId
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

    const tenantId = await getCurrentTenantId()
    const isSuperAdminUser = await isSuperAdmin()

    if (!categoryId) {
      throw new Error('Category ID is required')
    }

    if (!name || name.trim().length === 0) {
      throw new Error('Category name is required')
    }

    const adminClient = createAdminClient()

    // Verify category belongs to tenant (unless super_admin)
    if (!isSuperAdminUser) {
      const { data: category, error: verifyError } = await adminClient
        .from('course_categories')
        .select('tenant_id')
        .eq('id', categoryId)
        .single()

      if (verifyError || !category || category.tenant_id !== tenantId) {
        throw new Error('Category not found or access denied')
      }
    }

    const { error } = await adminClient
      .from('course_categories')
      .update({
        name: name.trim(),
        description: description?.trim() || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', categoryId)
      .eq('tenant_id', tenantId)

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

    const tenantId = await getCurrentTenantId()
    const isSuperAdminUser = await isSuperAdmin()

    if (!categoryId) {
      throw new Error('Category ID is required')
    }

    const adminClient = createAdminClient()

    // Verify category belongs to tenant (unless super_admin)
    if (!isSuperAdminUser) {
      const { data: category, error: verifyError } = await adminClient
        .from('course_categories')
        .select('tenant_id')
        .eq('id', categoryId)
        .single()

      if (verifyError || !category || category.tenant_id !== tenantId) {
        throw new Error('Category not found or access denied')
      }
    }

    // Check if any courses use this category (within tenant)
    const { count, error: countError } = await adminClient
      .from('courses')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', categoryId)
      .eq('tenant_id', tenantId)

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
      .eq('tenant_id', tenantId)

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
