'use server'

import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { revalidatePath } from 'next/cache'
import { randomBytes, createHash } from 'crypto'
import { getCurrentUserId } from '@/lib/supabase/tenant'

export interface McpToken {
  id: number
  name: string
  created_at: string
  last_used_at: string | null
  expires_at: string | null
  is_active: boolean
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function createMcpToken(name: string, expiresInDays?: number) {
  const role = await getUserRole()
  if (role !== 'teacher' && role !== 'admin') {
    throw new Error('Only teachers and admins can create API tokens')
  }

  const supabase = await createClient()
  const userId = await getCurrentUserId()
  if (!userId) throw new Error('Not authenticated')

  const rawToken = randomBytes(32).toString('hex')
  const tokenHash = hashToken(rawToken)

  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null

  const { error } = await supabase
    .from('mcp_api_tokens')
    .insert({
      user_id: userId,
      token_hash: tokenHash,
      name,
      expires_at: expiresAt,
      is_active: true,
    })

  if (error) throw new Error(error.message)

  revalidatePath('/dashboard/admin/api-tokens')
  revalidatePath('/dashboard/teacher/api-tokens')

  return { token: rawToken }
}

export async function listMcpTokens(): Promise<{ data: McpToken[] | null; error: string | null }> {
  const role = await getUserRole()
  if (role !== 'teacher' && role !== 'admin') {
    return { data: null, error: 'Unauthorized' }
  }

  const supabase = await createClient()
  const userId = await getCurrentUserId()
  if (!userId) return { data: null, error: 'Not authenticated' }

  const { data, error } = await supabase
    .from('mcp_api_tokens')
    .select('id, name, created_at, last_used_at, expires_at, is_active')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) return { data: null, error: error.message }
  return { data, error: null }
}

export async function revokeMcpToken(tokenId: number) {
  const role = await getUserRole()
  if (role !== 'teacher' && role !== 'admin') {
    throw new Error('Unauthorized')
  }

  const supabase = await createClient()

  const { error } = await supabase
    .from('mcp_api_tokens')
    .update({ is_active: false })
    .eq('id', tokenId)

  if (error) throw new Error(error.message)

  revalidatePath('/dashboard/admin/api-tokens')
  revalidatePath('/dashboard/teacher/api-tokens')
}

export async function deleteMcpToken(tokenId: number) {
  const role = await getUserRole()
  if (role !== 'teacher' && role !== 'admin') {
    throw new Error('Unauthorized')
  }

  const supabase = await createClient()

  const { error } = await supabase
    .from('mcp_api_tokens')
    .delete()
    .eq('id', tokenId)

  if (error) throw new Error(error.message)

  revalidatePath('/dashboard/admin/api-tokens')
  revalidatePath('/dashboard/teacher/api-tokens')
}
