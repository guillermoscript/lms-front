'use client'

/**
 * "Generate with AI" — the entry point that connects json-render generation to the Puck editor.
 *
 * Lives INSIDE <Puck> so it can use usePuck() to dispatch the generated page into the editor's
 * state. Flow: creator describes their page → POST /api/landing/generate → the route returns
 * Puck `Data` (json-render spec validated against the catalog, then bridged) → we replace the
 * editor content via dispatch({ type: 'setData' }). The creator can then refine any block by
 * hand. See docs/adr/0001-json-render-puck-landing-builder.md.
 */
import { useState } from 'react'
import { usePuck } from '@measured/puck'
import type { Data } from '@measured/puck'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { IconSparkles } from '@tabler/icons-react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

const EXAMPLES = [
  'A landing page for a beginner Spanish course: hero, key stats, what you learn, testimonials, and a sign-up CTA.',
  'A page for a coding bootcamp with a bold hero, pricing plans, instructor team, FAQ, and a final call to action.',
  'A minimal page for a photography masterclass: hero, gallery, social proof, and a CTA.',
]

export function GenerateWithAI() {
  const { dispatch } = usePuck()
  const t = useTranslations('puck')
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleGenerate() {
    if (!prompt.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/landing/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })

      if (!res.ok) {
        let message = t('ai.failed')
        try {
          const body = await res.json()
          if (body?.error) message = body.error
        } catch {
          // non-JSON error body — keep default message
        }
        toast.error(message)
        return
      }

      const { data } = (await res.json()) as { data: Data }
      if (!data || !Array.isArray(data.content) || data.content.length === 0) {
        toast.error(t('ai.empty'))
        return
      }

      // Replace the editor content with the generated page. Puck preserves UI state.
      dispatch({ type: 'setData', data })
      toast.success(t('ai.generated', { count: data.content.length }))
      setOpen(false)
      setPrompt('')
    } catch {
      toast.error(t('ai.failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <IconSparkles className="w-4 h-4" />
        {t('ai.button')}
      </Button>

      <Dialog open={open} onOpenChange={(v) => !loading && setOpen(v)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconSparkles className="w-5 h-5" />
              {t('ai.title')}
            </DialogTitle>
            <DialogDescription>{t('ai.description')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t('ai.placeholder')}
              rows={4}
              disabled={loading}
              autoFocus
            />
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={loading}
                  onClick={() => setPrompt(ex)}
                  className="rounded-full border border-border bg-muted px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/70 disabled:opacity-50"
                >
                  {t('ai.example')} {i + 1}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t('ai.replaceWarning')}</p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={loading}>
              {t('ai.cancel')}
            </Button>
            <Button onClick={handleGenerate} disabled={loading || !prompt.trim()} className="gap-1.5">
              <IconSparkles className="w-4 h-4" />
              {loading ? t('ai.generating') : t('ai.generate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
