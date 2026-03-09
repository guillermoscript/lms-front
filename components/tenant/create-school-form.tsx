'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { toast } from 'sonner'

export function CreateSchoolForm({ userId }: { userId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')

  const generateSlug = (value: string) => {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  }

  const handleNameChange = (value: string) => {
    setName(value)
    if (!slug || slug === generateSlug(name)) {
      setSlug(generateSlug(value))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !slug.trim()) return

    setLoading(true)
    const supabase = createClient()

    // Create tenant via RPC (handles tenant + tenant_users atomically)
    const { data: tenantId, error: createError } = await supabase
      .rpc('create_school', {
        _name: name.trim(),
        _slug: slug.trim(),
      })

    if (createError) {
      if (createError.code === '23505') {
        toast.error('This URL is already taken. Choose a different one.')
      } else {
        toast.error('Failed to create school: ' + createError.message)
      }
      setLoading(false)
      return
    }

    // Update user's preferred tenant
    await supabase.auth.updateUser({
      data: { preferred_tenant_id: tenantId }
    })

    toast.success('School created successfully!')

    // Redirect to subdomain
    const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN
    if (platformDomain && platformDomain !== 'localhost') {
      const protocol = window.location.protocol // Preserves http: or https:
      window.location.href = `${protocol}//${slug}.${platformDomain}/onboarding`
    } else {
      router.push('/onboarding')
    }
  }

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-zinc-300">School Name</Label>
            <Input
              id="name"
              data-testid="create-school-name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="My Awesome Academy"
              className="bg-zinc-800 border-zinc-700 text-white"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug" className="text-zinc-300">School URL</Label>
            <div className="flex items-center gap-0">
              <Input
                id="slug"
                data-testid="create-school-slug"
                value={slug}
                onChange={(e) => setSlug(generateSlug(e.target.value))}
                placeholder="my-academy"
                className="bg-zinc-800 border-zinc-700 text-white rounded-r-none"
                required
                pattern="[a-z0-9-]+"
              />
              <span className="px-3 py-2 bg-zinc-700 border border-l-0 border-zinc-700 rounded-r-md text-zinc-400 text-sm whitespace-nowrap">
                .{process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || 'lmsplatform.com'}
              </span>
            </div>
            <p className="text-xs text-zinc-500">
              Only lowercase letters, numbers, and hyphens
            </p>
          </div>
        </CardContent>

        <CardFooter>
          <Button
            type="submit"
            className="w-full"
            data-testid="create-school-submit"
            disabled={loading || !name.trim() || !slug.trim()}
          >
            {loading ? 'Creating...' : 'Create School'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
