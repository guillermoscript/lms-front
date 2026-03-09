'use client'

import type { AudioBlock } from '../types'
import { Input } from '@/components/ui/input'
import { IconVolume } from '@tabler/icons-react'

interface AudioBlockEditorProps {
  block: AudioBlock
  onChange: (updates: Partial<AudioBlock>) => void
}

export function AudioBlockEditor({ block, onChange }: AudioBlockEditorProps) {
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <IconVolume className="h-4 w-4 text-primary" />
        Audio
      </div>
      <Input
        value={block.src}
        onChange={(e) => onChange({ src: e.target.value })}
        placeholder="Audio URL (e.g. https://example.com/audio.mp3)"
      />
      <Input
        value={block.title || ''}
        onChange={(e) => onChange({ title: e.target.value || undefined })}
        placeholder="Title (optional)"
        className="text-sm"
      />
      {block.src && (
        <div className="mt-2 overflow-hidden rounded-md border p-2">
          <audio controls className="w-full" src={block.src}>
            Your browser does not support the audio element.
          </audio>
        </div>
      )}
    </div>
  )
}
