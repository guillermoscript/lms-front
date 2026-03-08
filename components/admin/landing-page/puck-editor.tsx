'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Puck, usePuck } from '@measured/puck'
import type { Data } from '@measured/puck'
import '@measured/puck/puck.css'
import { createPuckConfig } from '@/lib/puck/config'
import { updateLandingPage, publishLandingPage } from '@/app/actions/admin/landing-pages'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { IconArrowLeft, IconDeviceFloppy } from '@tabler/icons-react'
import { useTranslations } from 'next-intl'

interface Props {
  pageId: string
  pageName: string
  pageStatus: 'draft' | 'published'
  initialData: Data
  onBack: () => void
}

function SaveButton({ pageId, saving, onSaveStateChange }: { pageId: string; saving: boolean; onSaveStateChange: (saving: boolean) => void }) {
  const { appState } = usePuck()
  const lastSavedRef = useRef<string | null>(null)
  const t = useTranslations('puck')

  const handleSave = useCallback(async () => {
    const data = appState.data
    const json = JSON.stringify(data)
    if (json === lastSavedRef.current) {
      toast.info(t('editor.noChanges'))
      return
    }
    onSaveStateChange(true)
    try {
      const result = await updateLandingPage(pageId, { puck_data: data })
      if (result.success) {
        lastSavedRef.current = json
        toast.success(t('editor.saved'))
      } else {
        toast.error(result.error || t('editor.failedSave'))
      }
    } catch {
      toast.error(t('editor.failedSave'))
    } finally {
      onSaveStateChange(false)
    }
  }, [appState.data, pageId, onSaveStateChange, t])

  // Cmd+S / Ctrl+S keyboard shortcut
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleSave])

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleSave}
      disabled={saving}
      className="gap-1.5"
    >
      <IconDeviceFloppy className="w-4 h-4" />
      {saving ? t('editor.saving') : t('editor.save')}
    </Button>
  )
}

export function PuckEditor({ pageId, pageName, pageStatus, initialData, onBack }: Props) {
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(pageStatus)
  const t = useTranslations('puck')
  const config = useMemo(() => createPuckConfig(t), [t])

  const handlePublish = useCallback(async (data: Data) => {
    setSaving(true)
    try {
      const saveResult = await updateLandingPage(pageId, { puck_data: data })
      if (!saveResult.success) {
        toast.error(saveResult.error || t('editor.failedSave'))
        return
      }
      const pubResult = await publishLandingPage(pageId)
      if (pubResult.success) {
        setStatus('published')
        toast.success(t('editor.published'))
      } else {
        toast.error(pubResult.error || t('editor.failedPublish'))
      }
    } catch {
      toast.error(t('editor.failedPublish'))
    } finally {
      setSaving(false)
    }
  }, [pageId, t])

  return (
    <div className="h-[calc(100dvh-4rem)] flex flex-col">
      <Puck
        config={config}
        data={initialData}
        onPublish={handlePublish}
        headerPath={pageName}
        overrides={{
          headerActions: ({ children }) => (
            <>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onBack}
                  className="gap-1.5"
                >
                  <IconArrowLeft className="w-4 h-4" />
                  {t('editor.back')}
                </Button>
                <Badge variant={status === 'published' ? 'default' : 'secondary'}>
                  {t(`editor.status.${status}`)}
                </Badge>
              </div>
              <SaveButton pageId={pageId} saving={saving} onSaveStateChange={setSaving} />
              {children}
            </>
          ),
        }}
        viewports={[
          { width: 360, height: 'auto', label: 'Mobile', icon: 'Smartphone' },
          { width: 768, height: 'auto', label: 'Tablet', icon: 'Tablet' },
          { width: 1280, height: 'auto', label: 'Desktop', icon: 'Monitor' },
        ]}
      />
    </div>
  )
}
