'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconSearch, IconX } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const PLANS = ['free', 'starter', 'pro', 'business', 'enterprise']
const STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'inactive', label: 'Inactive' },
]

const selectClass =
  'h-7 rounded-md border border-input bg-input/20 px-2 text-sm capitalize outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 md:text-xs/relaxed dark:bg-input/30'

/**
 * A plain GET form so the URL is the state (shareable, back-button-safe, works
 * without JS). With JS, changing a select submits immediately — the operator
 * shouldn't have to reach for a button to narrow a list.
 */
export function TenantFilters({ q, plan, status }: { q?: string; plan?: string; status?: string }) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const submit = () => formRef.current?.requestSubmit()

  // Keep the URL clean: a GET form would post `q=&plan=&status=`. Without JS
  // the native submit still works, just with the empty keys.
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const p = new URLSearchParams()
    for (const [k, v] of new FormData(e.currentTarget)) {
      if (typeof v === 'string' && v.trim()) p.set(k, v.trim())
    }
    const s = p.toString()
    router.push(s ? `?${s}` : '?')
  }

  const active: { key: string; label: string; href: string; capitalize?: boolean }[] = []
  const params = (omit: string) => {
    const p = new URLSearchParams()
    if (q && omit !== 'q') p.set('q', q)
    if (plan && omit !== 'plan') p.set('plan', plan)
    if (status && omit !== 'status') p.set('status', status)
    const s = p.toString()
    return s ? `?${s}` : '?'
  }
  if (q) active.push({ key: 'q', label: `“${q}”`, href: params('q') })
  if (plan) active.push({ key: 'plan', label: `Plan: ${plan}`, href: params('plan'), capitalize: true })
  if (status) active.push({ key: 'status', label: `Status: ${status}`, href: params('status'), capitalize: true })

  return (
    <div className="mb-4 space-y-2">
      <form ref={formRef} onSubmit={onSubmit} className="flex flex-wrap items-center gap-2" data-testid="tenants-filter-form">
        <label className="relative">
          <span className="sr-only">Search schools by name</span>
          <IconSearch
            className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Search by name"
            className="w-56 pl-7"
            data-testid="tenants-search"
          />
        </label>
        <label className="sr-only" htmlFor="tenants-plan-filter">Plan</label>
        <select
          id="tenants-plan-filter"
          name="plan"
          defaultValue={plan || ''}
          onChange={submit}
          className={selectClass}
          data-testid="tenants-plan-filter"
        >
          <option value="">All plans</option>
          {PLANS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="tenants-status-filter">Status</label>
        <select
          id="tenants-status-filter"
          name="status"
          defaultValue={status || ''}
          onChange={submit}
          className={cn(selectClass, 'normal-case')}
          data-testid="tenants-status-filter"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <Button type="submit" size="sm" variant="outline" data-testid="tenants-filter-submit">
          Search
        </Button>
      </form>

      {active.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs" data-testid="tenants-active-filters">
          <span className="text-muted-foreground">Filtering by</span>
          {active.map((f) => (
            <Link
              key={f.key}
              href={f.href}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 py-0.5 pr-1.5 pl-2 hover:bg-muted',
                f.capitalize && 'capitalize',
              )}
              title="Remove this filter"
            >
              {f.label}
              <IconX className="size-3 text-muted-foreground" aria-hidden="true" />
            </Link>
          ))}
          <Link href="?" className="ml-1 text-primary hover:underline underline-offset-4" data-testid="tenants-clear-filters">
            Clear all
          </Link>
        </div>
      )}
    </div>
  )
}
