'use client'

import { useState, type ReactElement } from 'react'
import { useTranslations } from 'next-intl'

import { AssetLibrary } from '@/components/assets/asset-library'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

interface ImagePickerProps {
  /** Receives the public URL of the uploaded or picked image. */
  onSelect: (url: string) => void
  /** Element that opens the picker (rendered through `render`). */
  trigger: ReactElement
}

/**
 * Pick any image the school already owns (course covers, landing page,
 * certificates, AI images…) or drop a new one; a single new upload is
 * selected automatically.
 */
export function ImagePicker({ onSelect, trigger }: ImagePickerProps) {
  const t = useTranslations('dashboard.teacher.imagePicker')
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        {open && (
          <AssetLibrary
            mode="pick"
            kind="image"
            onSelect={(url) => {
              onSelect(url)
              setOpen(false)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
