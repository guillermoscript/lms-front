'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Break, Parent, Root, RootContent, Text } from 'mdast'
import type { Element as HastElement, ElementContent } from 'hast'
import { bundledLanguages, type BundledLanguage } from 'shiki'
import { useTranslations } from 'next-intl'
import { IconEye, IconPencil } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { CodeBlock, CodeBlockCopyButton } from '@/components/ai-elements/code-block'
import { cn } from '@/lib/utils'

/**
 * Community text (#872): posts, comments and discussion prompts.
 *
 * Deliberately a small subset of markdown. Raw HTML is dropped (`skipHtml`, and
 * never `rehype-raw`), images are removed (attachments are the image path),
 * headings are demoted so a post can not out-shout the page, and links open in
 * a new tab without passing the referrer or our PageRank. react-markdown's
 * default `urlTransform` stays on, so `javascript:`/`data:` hrefs are emptied.
 *
 * A single newline is a line break (`remarkSoftBreaks`): everything written
 * before #872 was plain text, and it must read exactly as it did.
 */

/** Turn every soft line break inside a text node into a hard `<br>`. */
export function remarkSoftBreaks() {
  const walk = (node: Parent) => {
    const next: RootContent[] = []
    for (const child of node.children as RootContent[]) {
      if (child.type === 'text' && child.value.includes('\n')) {
        const parts = child.value.split(/\r?\n/)
        parts.forEach((value, i) => {
          if (i > 0) next.push({ type: 'break' } satisfies Break)
          if (value) next.push({ type: 'text', value } satisfies Text)
        })
        continue
      }
      if ('children' in child) walk(child as Parent)
      next.push(child)
    }
    node.children = next as Parent['children']
  }
  return (tree: Root) => walk(tree)
}

const REMARK_PLUGINS = [remarkGfm, remarkSoftBreaks]
const DISALLOWED = ['img']
const LINK_REL = 'nofollow noopener noreferrer'

function textOf(nodes: ElementContent[]): string {
  return nodes
    .map((n) => (n.type === 'text' ? n.value : n.type === 'element' ? textOf(n.children) : ''))
    .join('')
}

function toLanguage(className: unknown): BundledLanguage {
  const classes = Array.isArray(className) ? className : typeof className === 'string' ? [className] : []
  const lang = classes
    .map(String)
    .find((c) => c.startsWith('language-'))
    ?.slice('language-'.length)
    .toLowerCase()
  // Unknown or missing → plain text; shiki falls back to raw tokens.
  return (lang && lang in bundledLanguages ? lang : 'text') as BundledLanguage
}

function FencedCode({ node, copyLabel }: { node?: HastElement; copyLabel: string }) {
  const code = node?.children.find((c): c is HastElement => c.type === 'element' && c.tagName === 'code')
  const source = code ? textOf(code.children).replace(/\n$/, '') : node ? textOf(node.children) : ''
  const language = toLanguage(code?.properties?.className)
  return (
    <CodeBlock code={source} language={language} className="my-2 text-xs [&_pre]:!bg-transparent">
      <CodeBlockCopyButton
        aria-label={copyLabel}
        title={copyLabel}
        className="absolute top-1 right-1 z-10 size-7 bg-background/80 opacity-70 hover:opacity-100 focus-visible:opacity-100"
      />
    </CodeBlock>
  )
}

function buildComponents(copyLabel: string): Components {
  return {
    p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel={LINK_REL}
        className="font-medium text-primary underline underline-offset-2 break-words hover:text-primary/80"
      >
        {children}
      </a>
    ),
    h1: ({ children }) => <h3 className="mt-3 mb-1 text-base font-semibold text-foreground">{children}</h3>,
    h2: ({ children }) => <h4 className="mt-3 mb-1 font-semibold text-foreground">{children}</h4>,
    h3: ({ children }) => <h4 className="mt-3 mb-1 font-semibold text-foreground">{children}</h4>,
    h4: ({ children }) => <h4 className="mt-3 mb-1 font-semibold text-foreground">{children}</h4>,
    h5: ({ children }) => <h4 className="mt-3 mb-1 font-semibold text-foreground">{children}</h4>,
    h6: ({ children }) => <h4 className="mt-3 mb-1 font-semibold text-foreground">{children}</h4>,
    strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
    ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
    ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
    li: ({ children }) => <li className="pl-0.5">{children}</li>,
    blockquote: ({ children }) => (
      <blockquote className="my-2 border-l-2 border-border pl-3 text-muted-foreground">{children}</blockquote>
    ),
    hr: () => <hr className="my-3 border-border" />,
    code: ({ children }) => (
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em] text-foreground">{children}</code>
    ),
    pre: ({ node }) => <FencedCode node={node} copyLabel={copyLabel} />,
    table: ({ children }) => (
      <div className="my-2 overflow-x-auto">
        <table className="w-full border-collapse text-left">{children}</table>
      </div>
    ),
    th: ({ children, style }) => (
      <th style={style} className="border-b border-border px-2 py-1 font-semibold text-foreground">
        {children}
      </th>
    ),
    td: ({ children, style }) => (
      <td style={style} className="border-b border-border/60 px-2 py-1">
        {children}
      </td>
    ),
  }
}

interface CommunityMarkdownProps {
  content: string
  className?: string
  /** Fold anything taller than ~12 lines behind "Show more". */
  collapsible?: boolean
  id?: string
}

export function CommunityMarkdown({ content, className, collapsible = false, id }: CommunityMarkdownProps) {
  const t = useTranslations('community.markdown')
  const bodyRef = useRef<HTMLDivElement>(null)
  const [overflows, setOverflows] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const el = bodyRef.current
    if (!collapsible || !el) return
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 4)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [collapsible, content])

  const folded = collapsible && !expanded

  return (
    <div className={cn('min-w-0 break-words text-foreground/90', className)} data-testid="community-markdown">
      <div
        ref={bodyRef}
        id={id}
        className={cn(
          'leading-relaxed',
          // 12 lines at leading-relaxed (1.625).
          folded && 'max-h-[19.5em] overflow-hidden',
          folded && overflows && '[mask-image:linear-gradient(to_bottom,black_70%,transparent)]'
        )}
      >
        <Markdown
          remarkPlugins={REMARK_PLUGINS}
          skipHtml
          disallowedElements={DISALLOWED}
          components={buildComponents(t('copyCode'))}
        >
          {content}
        </Markdown>
      </div>
      {collapsible && (overflows || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-1 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 rounded"
        >
          {expanded ? t('showLess') : t('showMore')}
        </button>
      )}
    </div>
  )
}

/**
 * Wraps a composer textarea with the markdown hint and a Preview toggle. The
 * textarea stays mounted (hidden) while previewing so focus/refs survive.
 */
export function CommunityMarkdownField({
  value,
  children,
  className,
  previewClassName,
}: {
  value: string
  children: ReactNode
  className?: string
  previewClassName?: string
}) {
  const t = useTranslations('community.markdown')
  const [preview, setPreview] = useState(false)
  // Posting clears the field; the next draft starts in edit mode.
  if (preview && !value.trim()) setPreview(false)
  const showPreview = preview && value.trim().length > 0

  return (
    <div className={cn('min-w-0 flex-1 space-y-1', className)}>
      <div className={cn(showPreview && 'hidden')}>{children}</div>
      {showPreview && (
        <div
          className={cn('min-h-16 rounded-md border border-input bg-muted/30 px-3 py-2 text-sm', previewClassName)}
          aria-label={t('preview')}
          role="region"
        >
          <CommunityMarkdown content={value} />
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="truncate font-mono text-[11px] text-muted-foreground" title={t('hint')}>
          {t('hint')}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 shrink-0 gap-1 px-2 text-[11px] text-muted-foreground"
          aria-pressed={preview}
          disabled={!value.trim()}
          onClick={() => setPreview((v) => !v)}
        >
          {preview ? <IconPencil size={12} /> : <IconEye size={12} />}
          {preview ? t('edit') : t('preview')}
        </Button>
      </div>
    </div>
  )
}
