'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { IconCopy, IconCheck, IconFile } from '@tabler/icons-react'

interface CodeBlockProps {
  children: string
  language?: string
  filename?: string
  showLineNumbers?: boolean
  highlightLines?: number[]
  className?: string
}

export function CodeBlock({
  children,
  language,
  filename,
  showLineNumbers = false,
  highlightLines = [],
  className,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null)

  const code = typeof children === 'string' ? children.trim() : String(children).trim()

  // Cargar Shiki y resaltar código
  useEffect(() => {
    let cancelled = false
    
    async function highlight() {
      try {
        const { codeToHtml } = await import('shiki')
        const html = await codeToHtml(code, {
          lang: language || 'text',
          theme: 'github-dark-default',
        })
        if (!cancelled) {
          setHighlightedHtml(html)
        }
      } catch {
        // Si falla, mostrar código sin resaltar
        if (!cancelled) {
          setHighlightedHtml(null)
        }
      }
    }

    if (language) {
      highlight()
    }

    return () => {
      cancelled = true
    }
  }, [code, language])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback para navegadores que no soportan clipboard API
      const textarea = document.createElement('textarea')
      textarea.value = code
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const lines = code.split('\n')

  return (
    <div className={cn('my-4 overflow-hidden rounded-lg border bg-[#0d1117]', className)}>
      {/* Header con filename y botón copiar */}
      <div className="flex items-center justify-between border-b border-gray-700 bg-[#161b22] px-4 py-2">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          {filename ? (
            <>
              <IconFile className="size-4" />
              <span>{filename}</span>
            </>
          ) : language ? (
            <span className="uppercase">{language}</span>
          ) : (
            <span>Código</span>
          )}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors"
          aria-label={copied ? 'Copiado' : 'Copiar código'}
        >
          {copied ? (
            <>
              <IconCheck className="size-4 text-green-400" />
              <span>Copiado</span>
            </>
          ) : (
            <>
              <IconCopy className="size-4" />
              <span>Copiar</span>
            </>
          )}
        </button>
      </div>

      {/* Código */}
      <div className="overflow-x-auto p-4">
        {highlightedHtml ? (
          <div
            className="text-sm [&>pre]:!bg-transparent [&>pre]:!p-0 [&>pre]:!m-0"
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        ) : (
          <pre className="text-sm">
            <code className="text-gray-300">
              {showLineNumbers ? (
                lines.map((line, i) => (
                  <div
                    key={i}
                    className={cn(
                      'flex',
                      highlightLines.includes(i + 1) && 'bg-yellow-500/10 -mx-4 px-4'
                    )}
                  >
                    <span className="mr-4 inline-block w-8 select-none text-right text-gray-600">
                      {i + 1}
                    </span>
                    <span>{line || ' '}</span>
                  </div>
                ))
              ) : (
                code
              )}
            </code>
          </pre>
        )}
      </div>
    </div>
  )
}

// Wrapper para uso en MDX que extrae props del className de markdown
export function Code({ className, children, ...props }: React.ComponentProps<'code'>) {
  const match = /language-(\w+)/.exec(className || '')
  const language = match ? match[1] : undefined
  
  // Si es código inline (no tiene language), renderizar como inline
  if (!language && typeof children === 'string' && !children.includes('\n')) {
    return (
      <code
        className="rounded bg-muted px-1.5 py-0.5 text-sm font-mono"
        {...props}
      >
        {children}
      </code>
    )
  }

  return (
    <CodeBlock language={language} {...props}>
      {String(children)}
    </CodeBlock>
  )
}

// Pre wrapper para MDX
export function Pre({ children }: { children: React.ReactNode }) {
  // El children de <pre> es un <code>, extraemos su contenido
  if (
    children &&
    typeof children === 'object' &&
    'props' in children
  ) {
    const element = children as React.ReactElement<React.ComponentProps<'code'>>
    if (element.type === 'code') {
      const { className, children: codeChildren, ...rest } = element.props
      return <Code className={className} {...rest}>{codeChildren}</Code>
    }
  }
  return <pre>{children}</pre>
}
