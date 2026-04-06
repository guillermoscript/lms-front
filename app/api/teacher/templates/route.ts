import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { NextRequest } from 'next/server'

// GET /api/teacher/templates?category=lesson_task&search=conversation
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const tenantId = await getCurrentTenantId()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return new Response('Unauthorized', { status: 401 })

  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')
  const search = searchParams.get('search')

  // System templates have no tenant_id; user templates are scoped to tenant
  let query = supabase
    .from('prompt_templates')
    .select('*')
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .or(`created_by.eq.${user.id},is_system.eq.true`)
    .order('is_system', { ascending: false })
    .order('created_at', { ascending: false })

  if (category) query = query.eq('category', category)
  if (search) query = query.ilike('name', `%${search}%`)

  const { data, error } = await query

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}

// POST /api/teacher/templates
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const tenantId = await getCurrentTenantId()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return new Response('Unauthorized', { status: 401 })

  const body = await req.json()

  const { data, error } = await supabase
    .from('prompt_templates')
    .insert({
      ...body,
      created_by: user.id,
      is_system: false,
      tenant_id: tenantId,
    })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}
