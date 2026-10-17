'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { IconCopy, IconPlus, IconWebhook } from '@tabler/icons-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  createWebhookEndpointAction, deleteWebhookEndpointAction, retryWebhookDeliveryAction,
  rotateWebhookSecretAction, setWebhookEndpointActiveAction, testWebhookEndpointAction,
  updateWebhookEndpointAction, type WebhookActionError,
} from '@/app/actions/webhooks'
import { WEBHOOK_WILDCARD, type WebhookScope } from '@/lib/webhooks/events'
import { parseEndpointInput, type WebhookField } from '@/lib/webhooks/input'
import type { WebhookDeliveryView, WebhookEndpointView } from '@/lib/webhooks/endpoints'

const ERROR_KEYS: readonly WebhookActionError[] = [
  'forbidden', 'invalid', 'insecure_url', 'blocked_host', 'not_found', 'limit_reached', 'internal',
]
const errorKey = (code: unknown) => ((ERROR_KEYS as readonly unknown[]).includes(code) ? (code as string) : 'internal')

interface Props {
  scope: WebhookScope
  endpoints: WebhookEndpointView[]
  deliveries: WebhookDeliveryView[]
  /** Event types this scope can subscribe to. */
  events: readonly string[]
  /** Public docs location for the signature recipe. */
  docsHref?: string
}

export function WebhooksManager({ scope, endpoints, deliveries, events }: Props) {
  const t = useTranslations('webhooks')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState<WebhookEndpointView | 'new' | null>(null)
  const [reveal, setReveal] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ kind: 'delete' | 'rotate'; endpoint: WebhookEndpointView } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  function run<T extends { ok: boolean }>(id: string, fn: () => Promise<T>, onOk: (r: T) => void) {
    setBusyId(id)
    startTransition(async () => {
      try {
        const r = await fn()
        if (r.ok) onOk(r)
        else toast.error(t(`errors.${errorKey((r as { error?: string }).error)}`))
      } catch {
        toast.error(t('errors.internal'))
      } finally {
        setBusyId(null)
        router.refresh()
      }
    })
  }

  const test = (e: WebhookEndpointView) =>
    run(e.id, () => testWebhookEndpointAction(scope, e.id), (r) => {
      const v = (r as { value?: { delivered: boolean; statusCode: number | null; error: string | null } }).value
      if (v?.delivered) toast.success(t('test.ok', { status: v.statusCode ?? 200 }))
      else toast.error(t('test.failed', { reason: v?.statusCode ? `HTTP ${v.statusCode}` : (v?.error ?? 'error') }))
    })

  const toggle = (e: WebhookEndpointView, active: boolean) =>
    run(e.id, () => setWebhookEndpointActiveAction(scope, e.id, active), () =>
      toast.success(active ? t('enabled') : t('disabled')))

  const retry = (d: WebhookDeliveryView) =>
    run(d.id, () => retryWebhookDeliveryAction(scope, d.id), () => toast.success(t('deliveries.requeued')))

  return (
    <div className="space-y-8" data-testid="webhooks-manager">
      <section aria-labelledby="wh-endpoints">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="wh-endpoints" className="text-sm font-semibold">{t('endpoints.title')}</h2>
          <Button size="lg" onClick={() => setEditing('new')} data-testid="webhook-add">
            <IconPlus data-icon="inline-start" aria-hidden /> {t('endpoints.add')}
          </Button>
        </div>

        {endpoints.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center" data-testid="webhooks-empty">
            <IconWebhook className="mx-auto mb-3 size-6 text-muted-foreground/60" aria-hidden />
            <p className="text-sm font-medium">{t('endpoints.empty')}</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">{t(`endpoints.emptyDesc.${scope}`)}</p>
          </div>
        ) : (
          <ul className="divide-y rounded-lg border" data-testid="webhook-list">
            {endpoints.map((e) => (
              <li key={e.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between" data-testid="webhook-row">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{e.name}</span>
                    {e.isActive ? (
                      <Badge variant="secondary">{t('status.active')}</Badge>
                    ) : (
                      <Badge variant="destructive">
                        {e.disabledReason === 'too_many_failures' ? t('status.autoDisabled') : t('status.paused')}
                      </Badge>
                    )}
                  </div>
                  <p className="break-all font-mono text-xs text-muted-foreground">{e.url}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.events.includes(WEBHOOK_WILDCARD) ? t('endpoints.allEvents') : e.events.join(', ')}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">{e.secretMask}</p>
                  {e.disabledReason === 'too_many_failures' && (
                    <p className="text-xs text-destructive" role="status">{t('endpoints.autoDisabledHint')}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Switch
                    checked={e.isActive}
                    disabled={pending && busyId === e.id}
                    onCheckedChange={(v) => toggle(e, Boolean(v))}
                    aria-label={t('endpoints.toggle', { name: e.name })}
                  />
                  <Button size="lg" variant="outline" disabled={pending && busyId === e.id} onClick={() => test(e)} data-testid="webhook-test">
                    {t('endpoints.test')}
                  </Button>
                  <Button size="lg" variant="outline" onClick={() => setEditing(e)}>{t('endpoints.edit')}</Button>
                  <Button size="lg" variant="ghost" onClick={() => setConfirm({ kind: 'rotate', endpoint: e })}>{t('endpoints.rotate')}</Button>
                  <Button size="lg" variant="destructive" onClick={() => setConfirm({ kind: 'delete', endpoint: e })}>{t('endpoints.delete')}</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {endpoints.length > 0 && (
        <section aria-labelledby="wh-deliveries">
          <h2 id="wh-deliveries" className="mb-3 text-sm font-semibold">{t('deliveries.title')}</h2>
          {deliveries.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">{t('deliveries.empty')}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table data-testid="webhook-deliveries">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('deliveries.event')}</TableHead>
                    <TableHead>{t('deliveries.endpoint')}</TableHead>
                    <TableHead>{t('deliveries.status')}</TableHead>
                    <TableHead>{t('deliveries.attempts')}</TableHead>
                    <TableHead>{t('deliveries.when')}</TableHead>
                    <TableHead className="w-0"><span className="sr-only">{t('deliveries.actions')}</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono text-xs">{d.eventType}</TableCell>
                      <TableCell className="text-xs">{d.endpointName}</TableCell>
                      <TableCell>
                        <Badge variant={d.status === 'failed' ? 'destructive' : d.status === 'success' ? 'secondary' : 'outline'}>
                          {t(`deliveries.statuses.${d.status}`)}
                        </Badge>
                        {d.status !== 'success' && (d.lastStatusCode || d.lastError) && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {d.lastStatusCode ? `HTTP ${d.lastStatusCode}` : d.lastError}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">{d.attempts}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        <time dateTime={d.createdAt}>{new Date(d.createdAt).toLocaleString()}</time>
                      </TableCell>
                      <TableCell>
                        {d.status === 'failed' && (
                          <Button size="sm" variant="outline" disabled={pending && busyId === d.id} onClick={() => retry(d)}>
                            {t('deliveries.retry')}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      )}

      <section className="rounded-lg border bg-muted/30 p-4" aria-labelledby="wh-help">
        <h2 id="wh-help" className="text-sm font-semibold">{t('help.title')}</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
          <li>{t('help.step1')}</li>
          <li>{t('help.step2')}</li>
          <li>{t('help.step3')}</li>
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">{t('help.verify')}</p>
      </section>

      {editing && (
        <EndpointDialog
          key={editing === 'new' ? 'new' : editing.id}
          scope={scope}
          endpoint={editing === 'new' ? null : editing}
          events={events}
          onClose={() => setEditing(null)}
          onCreatedSecret={(s) => setReveal(s)}
        />
      )}

      <SecretDialog secret={reveal} onClose={() => setReveal(null)} />

      <AlertDialog open={confirm !== null} onOpenChange={(o) => { if (!o) setConfirm(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === 'delete' ? t('confirm.deleteTitle') : t('confirm.rotateTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === 'delete' ? t('confirm.deleteDesc') : t('confirm.rotateDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm?.kind === 'delete' ? 'destructive' : 'default'}
              onClick={() => {
                const c = confirm
                setConfirm(null)
                if (!c) return
                if (c.kind === 'delete') {
                  run(c.endpoint.id, () => deleteWebhookEndpointAction(scope, c.endpoint.id), () => toast.success(t('deleted')))
                } else {
                  run(c.endpoint.id, () => rotateWebhookSecretAction(scope, c.endpoint.id), (r) => {
                    const secret = (r as { value?: { secret: string } }).value?.secret
                    if (secret) setReveal(secret)
                  })
                }
              }}
            >
              {confirm?.kind === 'delete' ? t('endpoints.delete') : t('endpoints.rotate')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function SecretDialog({ secret, onClose }: { secret: string | null; onClose: () => void }) {
  const t = useTranslations('webhooks')
  async function copy() {
    try {
      await navigator.clipboard.writeText(secret ?? '')
      toast.success(t('secret.copied'))
    } catch {
      toast.error(t('secret.copyFailed'))
    }
  }
  return (
    <Dialog open={secret !== null} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent data-testid="webhook-secret-dialog">
        <DialogHeader>
          <DialogTitle>{t('secret.title')}</DialogTitle>
          <DialogDescription>{t('secret.description')}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded-md border bg-muted px-3 py-2 font-mono text-xs" data-testid="webhook-secret-value">
            {secret}
          </code>
          <Button size="icon-lg" variant="outline" onClick={copy} aria-label={t('secret.copy')}>
            <IconCopy aria-hidden />
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>{t('secret.done')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EndpointDialog({
  scope, endpoint, events, onClose, onCreatedSecret,
}: {
  scope: WebhookScope
  endpoint: WebhookEndpointView | null
  events: readonly string[]
  onClose: () => void
  onCreatedSecret: (secret: string) => void
}) {
  const t = useTranslations('webhooks')
  const router = useRouter()
  const [name, setName] = useState(endpoint?.name ?? '')
  const [url, setUrl] = useState(endpoint?.url ?? '')
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(endpoint ? endpoint.events : [WEBHOOK_WILDCARD])
  )
  const [invalid, setInvalid] = useState<Set<WebhookField>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const all = selected.has(WEBHOOK_WILDCARD)

  function toggleEvent(ev: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.delete(WEBHOOK_WILDCARD)
      if (on) next.add(ev)
      else next.delete(ev)
      return next
    })
  }

  async function save() {
    const raw = { name, url, events: [...selected] }
    const local = parseEndpointInput(scope, raw)
    if (!local.ok) {
      setInvalid(new Set(local.fields))
      setError(t(`errors.${local.reason === 'insecure_url' || local.reason === 'blocked_host' ? local.reason : 'invalid'}`))
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (endpoint) {
        const r = await updateWebhookEndpointAction(scope, endpoint.id, raw)
        if (!r.ok) {
          setInvalid(new Set(r.fields ?? []))
          setError(t(`errors.${errorKey(r.error)}`))
          return
        }
        toast.success(t('saved'))
      } else {
        const r = await createWebhookEndpointAction(scope, raw)
        if (!r.ok) {
          setInvalid(new Set(r.fields ?? []))
          setError(t(`errors.${errorKey(r.error)}`))
          return
        }
        if (r.value) onCreatedSecret(r.value.secret)
      }
      onClose()
      router.refresh()
    } catch {
      setError(t('errors.internal'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg" data-testid="webhook-dialog">
        <DialogHeader>
          <DialogTitle>{endpoint ? t('form.editTitle') : t('form.createTitle')}</DialogTitle>
          <DialogDescription>{t('form.description')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          noValidate
          onSubmit={(e) => { e.preventDefault(); void save() }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="wh-name">{t('form.name')}</Label>
            <Input id="wh-name" value={name} maxLength={80} required placeholder={t('form.namePlaceholder')}
              aria-invalid={invalid.has('name') || undefined} onChange={(e) => setName(e.target.value)} data-testid="webhook-name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wh-url">{t('form.url')}</Label>
            <Input id="wh-url" type="url" value={url} maxLength={2048} required placeholder="https://your-n8n.example.com/webhook/…"
              aria-invalid={invalid.has('url') || undefined} aria-describedby="wh-url-hint" onChange={(e) => setUrl(e.target.value)} data-testid="webhook-url" />
            <p id="wh-url-hint" className="text-xs text-muted-foreground">{t('form.urlHint')}</p>
          </div>
          <fieldset className="space-y-2" aria-invalid={invalid.has('events') || undefined}>
            <legend className="mb-1 text-sm font-medium">{t('form.events')}</legend>
            <div className="flex items-center gap-2">
              <Checkbox id="wh-all" checked={all}
                onCheckedChange={(v) => setSelected(v ? new Set([WEBHOOK_WILDCARD]) : new Set())} />
              <Label htmlFor="wh-all" className="text-sm">{t('form.allEvents')}</Label>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {events.map((ev) => (
                <div key={ev} className="flex items-center gap-2">
                  <Checkbox id={`wh-ev-${ev}`} checked={all || selected.has(ev)} disabled={all}
                    onCheckedChange={(v) => toggleEvent(ev, Boolean(v))} />
                  <Label htmlFor={`wh-ev-${ev}`} className="font-mono text-xs">{ev}</Label>
                </div>
              ))}
            </div>
          </fieldset>
          {error && <p className="text-sm text-destructive" role="alert" data-testid="webhook-form-error">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t('cancel')}</Button>
            <Button type="submit" disabled={saving} data-testid="webhook-save">{saving ? t('form.saving') : t('form.save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
