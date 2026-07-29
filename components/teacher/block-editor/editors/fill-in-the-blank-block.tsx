'use client'

import { useTranslations } from 'next-intl'

import type { FillInTheBlankBlock } from '../types'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { IconPlus, IconTrash, IconTextPlus } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

interface FillInTheBlankBlockEditorProps {
  block: FillInTheBlankBlock
  onChange: (updates: Partial<FillInTheBlankBlock>) => void
}

export function FillInTheBlankBlockEditor({ block, onChange }: FillInTheBlankBlockEditorProps) {
  const t = useTranslations('dashboard.teacher.lessonEditor.blockEditor')
  const updateSegment = (index: number, value: string) => {
    const newSegments = [...block.segments]
    newSegments[index] = { ...newSegments[index], value }
    onChange({ segments: newSegments })
  }

  const addSegment = (type: 'text' | 'blank') => {
    onChange({ segments: [...block.segments, { type, value: '' }] })
  }

  const removeSegment = (index: number) => {
    if (block.segments.length <= 1) return
    onChange({ segments: block.segments.filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-3 rounded-lg border bg-gradient-to-br from-teal-500/5 to-cyan-500/5 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-teal-600">
        <IconTextPlus className="h-4 w-4" />
        {t('blocks.fill-in-the-blank.label')}
      </div>

      <div className="space-y-2">
        <span className="text-xs text-muted-foreground">
          {t('fillInTheBlank.segmentsLabel')}
        </span>
        {block.segments.map((segment, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className={cn(
              'text-xs shrink-0 rounded px-1.5 py-0.5',
              segment.type === 'blank'
                ? 'bg-primary/10 text-primary font-medium'
                : 'bg-muted text-muted-foreground'
            )}>
              {segment.type === 'blank' ? 'Blanco' : 'Texto'}
            </span>
            <Input
              value={segment.value}
              onChange={(e) => updateSegment(index, e.target.value)}
              placeholder={t(segment.type === 'blank' ? 'fillInTheBlank.blankPlaceholder' : 'fillInTheBlank.textPlaceholder')}
              className={cn(
                'flex-1',
                segment.type === 'blank' && 'border-dashed border-primary'
              )}
            />
            <button
              type="button"
              onClick={() => removeSegment(index)}
              disabled={block.segments.length <= 1}
              className="p-1 text-muted-foreground hover:text-destructive disabled:opacity-30"
              aria-label={t('fillInTheBlank.removeSegment')}
            >
              <IconTrash className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => addSegment('text')}
          className="flex-1"
        >
          <IconPlus className="h-4 w-4 mr-2" />
          {t('fillInTheBlank.addText')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => addSegment('blank')}
          className="flex-1"
        >
          <IconPlus className="h-4 w-4 mr-2" />
          {t('fillInTheBlank.addBlank')}
        </Button>
      </div>

      <div>
        <span className="text-xs text-muted-foreground">{t('explanationLabel')}</span>
        <Textarea
          value={block.explanation || ''}
          onChange={(e) => onChange({ explanation: e.target.value || undefined })}
          placeholder={t('explanationPlaceholder')}
          className="mt-1 min-h-[60px]"
        />
      </div>
    </div>
  )
}
