'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { IconCheck, IconCopy } from '@tabler/icons-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface ConnectCliAgentsProps {
  /** OAuth connector URL of the school being connected (no /cli suffix). */
  connectorUrl: string
  /** Teachers/admins can mint API tokens for headless use. */
  tokensAvailable?: boolean
  /** Where to create a token; omitted when the token UI is on the same page. */
  tokensHref?: string
}

/** `https://school.platform.com/api/mcp` → `lms-school`; anything else → `lms`. */
function serverName(url: string): string {
  try {
    const parts = new URL(url).hostname.split('.')
    return parts.length > 2 ? `lms-${parts[0]}` : 'lms'
  } catch {
    return 'lms'
  }
}

function Snippet({ code, label }: { code: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-md bg-muted p-3 pr-12 font-mono text-xs">{code}</pre>
      <Button
        variant="outline"
        size="icon-sm"
        className="absolute top-2 right-2"
        aria-label={label}
        onClick={async () => {
          await navigator.clipboard.writeText(code)
          setDone(true)
          toast.success(label)
          setTimeout(() => setDone(false), 2000)
        }}
      >
        {done ? <IconCheck className="size-3" /> : <IconCopy className="size-3" />}
      </Button>
    </div>
  )
}

/**
 * Copy-paste setup for CLI agents. OAuth first (the agent opens a browser, you
 * approve once, tokens refresh by themselves); an API token is only the
 * fallback for headless machines.
 */
export function ConnectCliAgents({ connectorUrl, tokensAvailable = false, tokensHref }: ConnectCliAgentsProps) {
  const t = useTranslations('components.connectClaude.cli')
  const name = serverName(connectorUrl)
  const tokenUrl = `${connectorUrl}/cli`
  const copy = t('copy')

  const json = (value: unknown) => JSON.stringify(value, null, 2)
  const tokenEnv = 'export LMS_MCP_TOKEN="<your token>"\n'

  // Per-agent: the sign-in setup (OAuth, preferred) and the headless token
  // fallback (null where the agent has no safe way to read the token from env).
  const tabs: { id: string; label: string; login: string; token: string | null }[] = [
    {
      id: 'claude-code',
      label: 'Claude Code',
      login: `claude mcp add --transport http ${name} ${connectorUrl}\nclaude mcp login ${name}`,
      token: `${tokenEnv}claude mcp add --transport http ${name} ${tokenUrl} \\\n  --header "Authorization: Bearer $LMS_MCP_TOKEN"`,
    },
    {
      id: 'codex',
      label: 'Codex',
      login: `codex mcp add ${name} --url ${connectorUrl}\ncodex mcp login ${name}`,
      token: `${tokenEnv}\n# ~/.codex/config.toml\n[mcp_servers.${name}]\nurl = "${tokenUrl}"\nbearer_token_env_var = "LMS_MCP_TOKEN"`,
    },
    {
      id: 'gemini',
      label: 'Gemini CLI',
      login: `gemini mcp add --transport http ${name} ${connectorUrl}\n# then, inside gemini:\n/mcp auth ${name}`,
      token: `${tokenEnv}gemini mcp add --transport http ${name} ${tokenUrl} \\\n  --header "Authorization: Bearer $LMS_MCP_TOKEN"`,
    },
    {
      id: 'cursor',
      label: 'Cursor',
      login: `// ~/.cursor/mcp.json\n${json({ mcpServers: { [name]: { url: connectorUrl } } })}`,
      token: `// ~/.cursor/mcp.json\n${json({ mcpServers: { [name]: { url: tokenUrl, headers: { Authorization: 'Bearer ${env:LMS_MCP_TOKEN}' } } } })}`,
    },
    {
      id: 'vscode',
      label: 'VS Code',
      login: `// .vscode/mcp.json\n${json({ servers: { [name]: { type: 'http', url: connectorUrl } } })}`,
      token: null,
    },
    {
      id: 'opencode',
      label: 'OpenCode',
      login: `// opencode.json\n${json({ $schema: 'https://opencode.ai/config.json', mcp: { [name]: { type: 'remote', url: connectorUrl, oauth: {} } } })}\n\nopencode mcp auth ${name}`,
      token: `${tokenEnv}// opencode.json\n${json({ mcp: { [name]: { type: 'remote', url: tokenUrl, oauth: false, headers: { Authorization: 'Bearer {env:LMS_MCP_TOKEN}' } } } })}`,
    },
    {
      id: 'antigravity',
      label: 'Antigravity (agy)',
      login: `// ~/.gemini/antigravity/mcp_config.json\n${json({ mcpServers: { [name]: { serverUrl: connectorUrl, oauth: {} } } })}\n\n# then, inside agy:\n/mcp`,
      token: null,
    },
    {
      id: 'other',
      label: t('other'),
      login: json({ mcpServers: { [name]: { type: 'http', url: connectorUrl } } }),
      token: json({ mcpServers: { [name]: { type: 'http', url: tokenUrl, headers: { Authorization: 'Bearer ${LMS_MCP_TOKEN}' } } } }),
    },
  ]

  return (
    <div className="space-y-3 border-t pt-4" data-testid="connect-cli-agents">
      <div>
        <p className="text-sm font-medium">{t('title')}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('description')}</p>
      </div>
      <Tabs defaultValue="claude-code">
        <TabsList className="h-auto flex-wrap justify-start">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className="space-y-3">
            <p className="text-xs text-muted-foreground">{t(tab.id === 'other' || tab.id === 'antigravity' ? `${tab.id}Hint` : 'oauthHint')}</p>
            <Snippet code={tab.login} label={copy} />
            {tokensAvailable && tab.token && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">{t('tokenSummary')}</summary>
                <div className="mt-2 space-y-2">
                  <p className="text-muted-foreground">
                    {t('tokenHint')}{' '}
                    {tokensHref && (
                      <Link href={tokensHref} className="font-medium underline underline-offset-2">
                        {t('createToken')}
                      </Link>
                    )}
                  </p>
                  <Snippet code={tab.token} label={copy} />
                </div>
              </details>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
