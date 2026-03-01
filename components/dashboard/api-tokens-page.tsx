'use client'

import { useState, useTransition } from 'react'
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
  DialogTrigger,
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
      toast.error('Please enter a token name')
      return
    }
    startTransition(async () => {
      try {
        const expiresInDays = expiration === 'never' ? undefined : Number(expiration)
        const result = await createMcpToken(tokenName.trim(), expiresInDays)
        setRevealedToken(result.token)
        setTokenName('')
        setExpiration('never')
        toast.success('Token created successfully')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to create token')
      }
    })
  }

  const handleRevoke = (tokenId: number) => {
    startTransition(async () => {
      try {
        await revokeMcpToken(tokenId)
        toast.success('Token revoked')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to revoke token')
      }
    })
  }

  const handleDelete = (tokenId: number) => {
    startTransition(async () => {
      try {
        await deleteMcpToken(tokenId)
        toast.success('Token deleted')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to delete token')
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
    return new Date(dateStr).toLocaleDateString('en-US', {
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
          <h1 className="text-2xl font-bold tracking-tight">API Tokens</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Generate tokens to connect Claude Desktop or other MCP clients to the LMS.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open) {
            setRevealedToken(null)
            setTokenName('')
            setExpiration('never')
          }
        }}>
          <DialogTrigger render={<Button />}>
            <IconPlus className="size-4 mr-1.5" />
            Create Token
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            {revealedToken ? (
              <>
                <DialogHeader>
                  <DialogTitle>Token Created</DialogTitle>
                  <DialogDescription>
                    Copy this token now. It won&apos;t be shown again.
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
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Claude Desktop config</Label>
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
                  <Button onClick={() => setCreateOpen(false)}>Done</Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>Create API Token</DialogTitle>
                  <DialogDescription>
                    Generate a token for MCP client access.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="token-name">Token Name</Label>
                    <Input
                      id="token-name"
                      placeholder="e.g., Claude Desktop"
                      value={tokenName}
                      onChange={(e) => setTokenName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="expiration">Expiration</Label>
                    <Select value={expiration} onValueChange={(v) => v && setExpiration(v)}>
                      <SelectTrigger id="expiration">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">7 days</SelectItem>
                        <SelectItem value="30">30 days</SelectItem>
                        <SelectItem value="90">90 days</SelectItem>
                        <SelectItem value="never">Never</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleCreate} disabled={isPending}>
                    {isPending ? 'Creating...' : 'Create Token'}
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
              <CardTitle className="text-sm">How to Connect</CardTitle>
              <CardDescription>
                Set up Claude Desktop or other MCP clients to access your LMS data.
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
              <li>Create a token above and copy the Claude Desktop config snippet.</li>
              <li>Open Claude Desktop settings and find the MCP servers configuration file.</li>
              <li>Paste the config snippet and save.</li>
              <li>Restart Claude Desktop — you should see the LMS tools available.</li>
            </ol>
          </CardContent>
        )}
      </Card>

      {/* Token List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Your Tokens</CardTitle>
          <CardDescription>
            {tokens.length === 0
              ? 'No tokens yet. Create one to get started.'
              : `${tokens.length} token${tokens.length === 1 ? '' : 's'}`
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
                            Revoked
                          </span>
                        )}
                        {!inactive && expired && (
                          <span className="text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">
                            Expired
                          </span>
                        )}
                        {!inactive && !expired && (
                          <span className="text-xs bg-green-500/10 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        <span>Created {formatDate(token.created_at)}</span>
                        {token.last_used_at && <span>Last used {formatDate(token.last_used_at)}</span>}
                        {token.expires_at && <span>Expires {formatDate(token.expires_at)}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {token.is_active && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleRevoke(token.id)}
                          disabled={isPending}
                          title="Revoke token"
                        >
                          <IconBan className="size-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDelete(token.id)}
                        disabled={isPending}
                        title="Delete token"
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
