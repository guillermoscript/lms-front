'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSuperAdmin } from '@/lib/supabase/get-user-role'
import { getCurrentUserId } from '@/lib/supabase/tenant'
import {
  createSchoolOnBehalfCore,
  type CreateSchoolOnBehalfInput,
  type CreateSchoolOnBehalfResult,
} from '@/lib/tenant/create-school-on-behalf'

/**
 * Super admin: create a school on someone's behalf, already in a billing mode,
 * and assign (or invite) its owner admin (#984). Never throws for auth or
 * validation failures; the form renders the returned `errors`.
 */
export async function createSchoolOnBehalf(input: CreateSchoolOnBehalfInput): Promise<CreateSchoolOnBehalfResult> {
  const superAdminId = await getCurrentUserId()
  if (!superAdminId || !(await isSuperAdmin())) {
    return { ok: false, errors: {}, error: 'Super admin only' }
  }

  const result = await createSchoolOnBehalfCore({ admin: createAdminClient(), superAdminId, input })
  if (result.ok) revalidatePath('/platform/tenants')
  return result
}
