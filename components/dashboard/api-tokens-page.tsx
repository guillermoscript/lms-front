'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { IconPlus, IconCopy, IconTrash, IconBan, IconCheck, IconChevronDown, IconChevronUp } from '@tabler/icons-react'
import { toast } from 'sonner'
import { createMcpToken, revokeMcpToken, deleteMcpToken, type McpToken } from '@/app/actions/mcp-tokens'

interface ApiTokensPageProps {
  tokens: McpToken[]
  domain: string
}

export default function ApiTokensPage({ tokens, domain }: ApiTokensPageProps) {
  const t = useTranslations('dashboard.admin.apiTokens')
  const [createOpen, setCreateOpen] = useState(false)
  const [revealedToken, setRevealedToken] = useState<string | null>(null)
  const [tokenName, setTokenName] = useState('')
  const [expiration, setExpiration] = useState<string>('never')
  const [isPending, startTransition] = useTransition()
  const [copied, setCopied] = useState(false)
  const [copiedConfig, setCopiedConfig] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)

  const handleCreate = () => {
    if (!tokenName.trim()) {
      toast.error(t('toasts.nameRequired'))
      return
    }
    startTransition(async () => {
      try {
        const expiresInDays = expiration === 'never' ? undefined : Number(expiration)
        const result = await createMcpToken(tokenName.trim(), expiresInDays)
        setRevealedToken(result.token)
        setTokenName('')
        setExpiration('never')
        toast.success(t('toasts.created'))
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('toasts.createError'))
      }
    })
  }

  const handleRevoke = (tokenId: number) => {
    startTransition(async () => {
      try {
        await revokeMcpToken(tokenId)
        toast.success(t('toasts.revoked'))
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('toasts.revokeError'))
      }
    })
  }

  const handleDelete = (tokenId: number) => {
    startTransition(async () => {
      try {
        await deleteMcpToken(tokenId)
        toast.success(t('toasts.deleted'))
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('toasts.deleteError'))
      }
    })
  }

  const copyToClipboard = async (text: string, type: 'token' | 'config') => {
    await navigator.clipboard.writeText(text)
    if (type === 'token') {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } else {
      setCopiedConfig(true)
      setTimeout(() => setCopiedConfig(false), 2000)
    }
  }

  const configSnippet = (token: string) => JSON.stringify({
    mcpServers: {
      lms: {
        url: `https://${domain}/api/mcp/cli`,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    },
  }, null, 2)

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false
    return new Date(expiresAt) < new Date()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t('description')}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <IconPlus className="size-4 mr-1.5" />
          {t('createToken')}
        </Button>
        <Dialog open={createOpen} onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open) {
            setRevealedToken(null)
            setTokenName('')
            setExpiration('never')
          }
        }}>
          <DialogContent className="sm:max-w-md">
            {revealedToken ? (
              <>
                <DialogHeader>
                  <DialogTitle>{t('revealDialog.title')}</DialogTitle>
                  <DialogDescription>
                    {t('revealDialog.description')}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={revealedToken}
                      className="font-mono text-xs"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard(revealedToken, 'token')}
                    >
                      {copied ? <IconCheck className="size-4" /> : <IconCopy className="size-4" />}
                    </Button>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">{t('revealDialog.configLabel')}</Label>
                    <div className="relative">
                      <pre className="bg-muted rounded-md p-3 text-xs overflow-x-auto">
                        {configSnippet(revealedToken)}
                      </pre>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        className="absolute top-2 right-2"
                        onClick={() => copyToClipboard(configSnippet(revealedToken), 'config')}
                      >
                        {copiedConfig ? <IconCheck className="size-3" /> : <IconCopy className="size-3" />}
                      </Button>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => setCreateOpen(false)}>{t('revealDialog.done')}</Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>{t('createDialog.title')}</DialogTitle>
                  <DialogDescription>
                    {t('createDialog.description')}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="token-name">{t('createDialog.nameLabel')}</Label>
                    <Input
                      id="token-name"
                      placeholder={t('createDialog.namePlaceholder')}
                      value={tokenName}
                      onChange={(e) => setTokenName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="expiration">{t('createDialog.expirationLabel')}</Label>
                    <Select value={expiration} onValueChange={(v) => v && setExpiration(v)}>
                      <SelectTrigger id="expiration">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">{t('createDialog.expiration7d')}</SelectItem>
                        <SelectItem value="30">{t('createDialog.expiration30d')}</SelectItem>
                        <SelectItem value="90">{t('createDialog.expiration90d')}</SelectItem>
                        <SelectItem value="never">{t('createDialog.expirationNever')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleCreate} disabled={isPending}>
                    {isPending ? t('createDialog.creating') : t('createDialog.create')}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Connection Instructions */}
      <Card>
        <CardHeader
          className="cursor-pointer"
          onClick={() => setShowInstructions(!showInstructions)}
        >
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm">{t('howToConnect.title')}</CardTitle>
              <CardDescription>
                {t('howToConnect.description')}
              </CardDescription>
            </div>
            {showInstructions
              ? <IconChevronUp className="size-4 text-muted-foreground" />
              : <IconChevronDown className="size-4 text-muted-foreground" />
            }
          </div>
        </CardHeader>
        {showInstructions && (
          <CardContent className="text-sm space-y-3">
            <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
              <li>{t('howToConnect.step1')}</li>
              <li>{t('howToConnect.step2')}</li>
              <li>{t('howToConnect.step3')}</li>
              <li>{t('howToConnect.step4')}</li>
            </ol>
          </CardContent>
        )}
      </Card>

      {/* Token List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t('yourTokens.title')}</CardTitle>
          <CardDescription>
            {tokens.length === 0
              ? t('yourTokens.empty')
              : tokens.length === 1
                ? t('yourTokens.count', { count: tokens.length })
                : t('yourTokens.countPlural', { count: tokens.length })
            }
          </CardDescription>
        </CardHeader>
        {tokens.length > 0 && (
          <CardContent>
            <div className="divide-y">
              {tokens.map((token) => {
                const expired = isExpired(token.expires_at)
                const inactive = !token.is_active
                return (
                  <div key={token.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{token.name}</span>
                        {inactive && (
                          <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                            {t('token.revoked')}
                          </span>
                        )}
                        {!inactive && expired && (
                          <span className="text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">
                            {t('token.expired')}
                          </span>
                        )}
                        {!inactive && !expired && (
                          <span className="text-xs bg-green-500/10 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded">
                            {t('token.active')}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        <span>{t('token.created', { date: formatDate(token.created_at) })}</span>
                        {token.last_used_at && <span>{t('token.lastUsed', { date: formatDate(token.last_used_at) })}</span>}
                        {token.expires_at && <span>{t('token.expires', { date: formatDate(token.expires_at) })}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {token.is_active && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleRevoke(token.id)}
                          disabled={isPending}
                          title={t('actions.revoke')}
                        >
                          <IconBan className="size-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDelete(token.id)}
                        disabled={isPending}
                        title={t('actions.delete')}
                      >
                        <IconTrash className="size-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
