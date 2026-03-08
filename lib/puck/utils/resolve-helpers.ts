// Helpers for Puck resolveData - fetch live data for dynamic components
import { createClient } from '@/lib/supabase/client'

export async function fetchCourses(tenantId: string, limit = 12) {
  const supabase = createClient()
  const { data } = await supabase
    .from('courses')
    .select('course_id, title, description, image_url, status')
    .eq('tenant_id', tenantId)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

export async function fetchProducts(tenantId: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('products')
    .select('product_id, name, description, price, currency, image, status')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function fetchCourseById(courseId: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('courses')
    .select('course_id, title, description, image_url, status')
    .eq('course_id', courseId)
    .single()
  return data
}
