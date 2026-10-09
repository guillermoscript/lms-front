'use client'

/**
 * The landing-page editor: Puck + the docked Page Architect chat (design §3.6).
 *
 * Puck regenerates its whole app store whenever `config`, `overrides`, `viewports`, `iframe`,
 * `onAction` or `metadata` change identity (critique A4), which would reset a streaming AI turn.
 * So every one of those is stable: overrides/viewports/iframe are module constants whose
 * components read live state from context, `onAction`/`onChange` read refs, and `metadata`
 * changes only between AI turns (`useLandingMetadata` defers merges while a turn runs).
 *
 * Saves are explicit and compare-and-swap on `updated_at` (critique F4): the editor keeps the
 * row's latest `updated_at`; a conflict asks the admin to reload or overwrite.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Puck, useGetPuck } from '@measured/puck'
import type { Config, Data, Overrides, PuckAction } from '@measured/puck'
import '@measured/puck/puck.css'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { IconArrowLeft, IconDeviceFloppy, IconPalette, IconSparkles } from '@tabler/icons-react'
import { createPuckConfig } from '@/lib/puck/config'
import { LandingPickerProviders } from '@/lib/puck/utils/landing-pickers-context'
import type { LandingData } from '@/lib/puck/types'
import {
  getLandingPage,
  publishLandingPage,
  updateLandingPage,
  type LandingPage,
} from '@/app/actions/admin/landing-pages'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import BrandingSettingsForm from '@/components/admin/branding-settings-form'
import { useLandingMetadata } from '@/components/admin/landing-page/use-landing-metadata'
import { PageArchitectPanel } from '@/components/admin/landing-page/page-architect/page-architect-panel'
import {
  PageArchitectProvider,
  usePageArchitectContext,
  usePageArchitectController,
} from '@/components/admin/landing-page/page-architect/page-architect-context'
import { dispatchOwn, isOwnPuckAction, type PuckApiLike } from '@/components/admin/landing-page/page-architect/apply-op-to-puck'
import { ThemePreviewScope } from '@/components/admin/landing-page/page-architect/theme-preview'
import { cn } from '@/lib/utils'
import styles from './puck-editor.module.css'

interface Props {
  pageId: string
  pageName: string
  pageStatus: 'draft' | 'published'
  initialData: Data
  /** The row's `updated_at` when it was loaded: the first save's compare-and-swap value. */
  initialUpdatedAt: string
  brandingSettings: Record<string, unknown>
  landingData: LandingData
  /** The AI assistant follows the existing plan gate (paid plans). */
  aiEnabled?: boolean
  /** A first message for the AI chat ("describe your page"): the panel opens and sends it once. */
  initialPrompt?: string
  /** Leave the editor; `latest` is the row after the last successful save/publish. */
  onBack: (latest: LandingPage | null) => void
}

/** Puck actions that change the page (a human edit, undo/redo, a reload). */
const DATA_ACTIONS = new Set(['insert', 'replace', 'replaceRoot', 'move', 'reorder', 'remove', 'duplicate', 'setData', 'set'])

const VIEWPORTS = [
  { width: 360, height: 'auto' as const, label: 'Mobile', icon: 'Smartphone' as const },
  { width: 768, height: 'auto' as const, label: 'Tablet', icon: 'Tablet' as const },
  { width: 1280, height: 'auto' as const, label: 'Desktop', icon: 'Monitor' as const },
]
const IFRAME = { enabled: false }

// ── Editor chrome context (read by the stable override components) ────────────────────

type ConflictChoice = 'reload' | 'overwrite' | 'cancel'

interface EditorChrome {
  pageId: string
  locale: 'en' | 'es'
  /** The "describe your page" message, handed out once (`null` after that). */
  takeInitialPrompt: () => string | null
  status: 'draft' | 'published'
  saving: boolean
  dirty: boolean
  aiEnabled: boolean
  aiOpen: boolean
  setAiOpen: (open: boolean) => void
  openBranding: () => void
  requestBack: () => void
  save: (data: Data) => Promise<void>
  conflict: { data: Data; publish: boolean } | null
  resolveConflict: (choice: ConflictChoice, getPuck: () => PuckApiLike) => Promise<void>
  leaveOpen: boolean
  setLeaveOpen: (open: boolean) => void
  leave: () => void
}

const EditorChromeContext = createContext<EditorChrome | null>(null)

/**
 * Header button labels give way to their icons while the editor column is narrow (the docked
 * chat takes 22rem), so Puck's header never grows wider than its column and pushes the fields
 * sidebar under the chat. The label stays for screen readers, and `title` names it on hover.
 */
const COMPACT_LABEL = '@max-4xl/editor:sr-only'

function useChrome(): EditorChrome {
  const value = useContext(EditorChromeContext)
  if (!value) throw new Error('useChrome must be used inside the landing-page editor')
  return value
}

function HeaderActions({ children }: { children: ReactNode }) {
  const chrome = useChrome()
  const { turnActive } = usePageArchitectContext()
  const getPuck = useGetPuck()
  const t = useTranslations('puck')
  const tp = useTranslations('pageArchitect.panel')

  // Cmd+S / Ctrl+S (a ref, so the listener is bound once).
  const saveRef = useRef(() => chrome.save(getPuck().appState.data as Data))
  useEffect(() => {
    saveRef.current = () => chrome.save(getPuck().appState.data as Data)
  })
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void saveRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={chrome.requestBack} className="gap-1.5" title={t('editor.back')}>
          <IconArrowLeft className="h-4 w-4" aria-hidden />
          <span className={COMPACT_LABEL}>{t('editor.back')}</span>
        </Button>
        <Badge variant={chrome.status === 'published' ? 'default' : 'secondary'}>{t(`editor.status.${chrome.status}`)}</Badge>
        {chrome.dirty && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="editor-dirty">
            <span className="size-1.5 rounded-full bg-warning" aria-hidden />
            {tp('editor.unsaved')}
          </span>
        )}
      </div>
      <Button variant="outline" size="sm" onClick={chrome.openBranding} className="gap-1.5" title={t('editor.branding')}>
        <IconPalette className="h-4 w-4" aria-hidden />
        <span className={COMPACT_LABEL}>{t('editor.branding')}</span>
      </Button>
      {chrome.aiEnabled && (
        <Button
          variant={chrome.aiOpen ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => chrome.setAiOpen(!chrome.aiOpen)}
          aria-pressed={chrome.aiOpen}
          className="gap-1.5"
          data-testid="page-architect-toggle"
        >
          <IconSparkles className="h-4 w-4" aria-hidden />
          <span className={COMPACT_LABEL}>{tp('open')}</span>
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={() => void chrome.save(getPuck().appState.data as Data)}
        disabled={chrome.saving || turnActive}
        title={turnActive ? tp('editor.waitForAi') : t('editor.save')}
        className="gap-1.5"
      >
        <IconDeviceFloppy className="h-4 w-4" aria-hidden />
        <span className={COMPACT_LABEL}>{chrome.saving ? t('editor.saving') : t('editor.save')}</span>
      </Button>
      {children}
    </>
  )
}

function EditorDialogs() {
  const chrome = useChrome()
  const getPuck = useGetPuck()
  const tp = useTranslations('pageArchitect.panel.editor')
  const get = () => getPuck() as unknown as PuckApiLike

  return (
    <>
      <AlertDialog open={!!chrome.conflict} onOpenChange={(open) => !open && void chrome.resolveConflict('cancel', get)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tp('conflictTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{tp('conflictBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tp('cancel')}</AlertDialogCancel>
            <Button variant="outline" onClick={() => void chrome.resolveConflict('reload', get)}>
              {tp('reload')}
            </Button>
            <AlertDialogAction onClick={() => void chrome.resolveConflict('overwrite', get)}>{tp('overwrite')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={chrome.leaveOpen} onOpenChange={chrome.setLeaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tp('unsavedTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{tp('unsavedBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tp('stay')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={chrome.leave}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {tp('leave')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/** `overrides.puck` (critique A6): Puck's default layout + header, with the chat docked right. */
function EditorShell({ children }: { children?: ReactNode }) {
  const chrome = useChrome()
  const getPuck = useGetPuck()
  const docked = chrome.aiEnabled && chrome.aiOpen
  // The docked chat takes 22rem: fold the components drawer while it is open so the canvas keeps
  // its width (the drawer stays one click away in Puck's header), unfold it when the chat closes.
  useEffect(() => {
    if (!chrome.aiEnabled) return
    getPuck().dispatch({ type: 'setUi', ui: { leftSideBarVisible: !docked } })
  }, [chrome.aiEnabled, docked, getPuck])
  return (
    <div className="relative flex h-full min-h-0 w-full" data-ai-docked={docked ? 'true' : undefined}>
      {/* A size container: the header compacts to icons when the canvas column is narrow. */}
      <div className="@container/editor h-full min-w-0 flex-1">{children}</div>
      {chrome.aiEnabled && (
        // Kept mounted while hidden, so closing the panel keeps the conversation and any turn.
        <PageArchitectPanel
          pageId={chrome.pageId}
          locale={chrome.locale}
          takeInitialPrompt={chrome.takeInitialPrompt}
          onClose={() => chrome.setAiOpen(false)}
          className={cn(
            'relative z-10 w-full shrink-0 sm:w-[22rem]',
            'max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-20 max-lg:shadow-xl',
            !chrome.aiOpen && 'hidden'
          )}
        />
      )}
      <EditorDialogs />
    </div>
  )
}

const OVERRIDES: Partial<Overrides> = {
  headerActions: HeaderActions,
  puck: EditorShell,
  preview: ThemePreviewScope,
}

// ── The editor ─────────────────────────────────────────────────────────────────────────

export function PuckEditor({
  pageId,
  pageName,
  pageStatus,
  initialData,
  initialUpdatedAt,
  brandingSettings,
  landingData,
  aiEnabled = true,
  initialPrompt,
  onBack,
}: Props) {
  const t = useTranslations('puck')
  const tp = useTranslations('pageArchitect.panel.editor')
  const locale: 'en' | 'es' = useLocale() === 'es' ? 'es' : 'en'
  // Blocks dragged in by hand get their default copy in the page's language (#944).
  const config = useMemo(() => createPuckConfig(t, locale) as Config, [t, locale])

  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(pageStatus)
  const [brandingOpen, setBrandingOpen] = useState(false)
  // Docked open where the canvas keeps room beside both Puck sidebars; one click away otherwise.
  const [aiOpen, setAiOpen] = useState(
    () => aiEnabled && (!!initialPrompt || (typeof window !== 'undefined' && window.innerWidth >= 1280))
  )
  const [dirty, setDirty] = useState(false)
  // Lives here, above Puck's override tree (which remounts once while the editor boots), so
  // the description is sent by exactly one panel instance.
  const initialPromptRef = useRef(aiEnabled ? initialPrompt?.trim() || null : null)
  const takeInitialPrompt = useCallback(() => {
    const prompt = initialPromptRef.current
    initialPromptRef.current = null
    return prompt
  }, [])
  const [conflict, setConflict] = useState<{ data: Data; publish: boolean } | null>(null)
  const [leaveOpen, setLeaveOpen] = useState(false)

  // Bumped on every change; a save clears `dirty` only if nothing changed while it ran.
  const changeSeq = useRef(0)
  const markDirty = useCallback(() => {
    changeSeq.current++
    setDirty(true)
  }, [])

  const updatedAtRef = useRef(initialUpdatedAt)
  const latestRef = useRef<LandingPage | null>(null)
  const savingRef = useRef(false)

  const architect = usePageArchitectController({ onAiCommit: markDirty })
  const turnActiveRef = useRef(false)
  useEffect(() => {
    turnActiveRef.current = architect.value.turnActive
  })
  const { metadata, onDataChange } = useLandingMetadata(landingData, { isAiTurnActive: architect.value.turnActive })

  // Stable for the editor's lifetime: Puck subscribes `onChange` once, and `onAction` is a
  // store-regeneration dependency.
  const onDataChangeRef = useRef(onDataChange)
  useEffect(() => {
    onDataChangeRef.current = onDataChange
  })
  const onChange = useCallback((data: Data) => onDataChangeRef.current(data), [])
  // Puck's onChange fires only on a change: fetch what the opened page binds but the
  // server bundle (built for every page, capped) lacks, once on mount.
  const initialDataRef = useRef(initialData)
  useEffect(() => {
    onDataChangeRef.current(initialDataRef.current)
  }, [])
  const architectOnAction = architect.onAction
  const onAction = useCallback(
    (action: PuckAction) => {
      architectOnAction(action)
      if (!isOwnPuckAction(action) && DATA_ACTIONS.has(action.type)) markDirty()
    },
    [architectOnAction, markDirty]
  )

  // Unsaved work survives an accidental tab close only by asking. An AI turn in flight counts:
  // its ops are applied but `dirty` is set only once the turn commits.
  const unsaved = dirty || architect.value.turnActive
  useEffect(() => {
    if (!unsaved) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [unsaved])

  const persist = useCallback(
    async (data: Data, opts: { publish?: boolean; overwrite?: boolean } = {}) => {
      if (savingRef.current) return
      if (turnActiveRef.current) {
        toast.info(tp('waitForAi'))
        return
      }
      savingRef.current = true
      setSaving(true)
      const seq = changeSeq.current
      try {
        const result = await updateLandingPage(
          pageId,
          { puck_data: data },
          { expectedUpdatedAt: opts.overwrite ? null : updatedAtRef.current }
        )
        if (!result.success) {
          if (result.code === 'conflict') setConflict({ data, publish: !!opts.publish })
          else toast.error(result.error || t('editor.failedSave'))
          return
        }
        updatedAtRef.current = result.data.updated_at
        latestRef.current = result.data
        if (changeSeq.current === seq) setDirty(false)
        if (!opts.publish) {
          toast.success(t('editor.saved'))
          return
        }
        const pub = await publishLandingPage(pageId)
        if (pub.success && pub.data) {
          updatedAtRef.current = pub.data.updated_at
          latestRef.current = pub.data
          setStatus('published')
          toast.success(t('editor.published'))
        } else {
          toast.error((!pub.success && pub.error) || t('editor.failedPublish'))
        }
      } catch {
        toast.error(opts.publish ? t('editor.failedPublish') : t('editor.failedSave'))
      } finally {
        savingRef.current = false
        setSaving(false)
      }
    },
    [pageId, t, tp]
  )

  const save = useCallback(
    async (data: Data) => {
      if (!dirty) {
        toast.info(t('editor.noChanges'))
        return
      }
      await persist(data)
    },
    [dirty, persist, t]
  )

  const handlePublish = useCallback((data: Data) => void persist(data, { publish: true }), [persist])

  const resolveConflict = useCallback(
    async (choice: ConflictChoice, getPuck: () => PuckApiLike) => {
      const pending = conflict
      setConflict(null)
      if (!pending || choice === 'cancel') return
      if (choice === 'overwrite') {
        await persist(pending.data, { publish: pending.publish, overwrite: true })
        return
      }
      const fresh = await getLandingPage(pageId)
      if (!fresh.success || !fresh.data) {
        toast.error(tp('reloadFailed'))
        return
      }
      // Recorded, so Ctrl+Z brings the local version back if the reload was a mistake.
      dispatchOwn(getPuck(), { type: 'setData', data: fresh.data.puck_data, recordHistory: true })
      updatedAtRef.current = fresh.data.updated_at
      latestRef.current = fresh.data
      setStatus(fresh.data.status)
      setDirty(false)
      toast.success(tp('reloaded'))
    },
    [conflict, pageId, persist, tp]
  )

  const requestBack = useCallback(() => {
    if (dirty || turnActiveRef.current) setLeaveOpen(true)
    else onBack(latestRef.current)
  }, [dirty, onBack])

  const leave = useCallback(() => {
    setLeaveOpen(false)
    onBack(latestRef.current)
  }, [onBack])

  const chrome = useMemo<EditorChrome>(
    () => ({
      pageId,
      locale,
      takeInitialPrompt,
      status,
      saving,
      dirty,
      aiEnabled,
      aiOpen,
      setAiOpen,
      openBranding: () => setBrandingOpen(true),
      requestBack,
      save,
      conflict,
      resolveConflict,
      leaveOpen,
      setLeaveOpen,
      leave,
    }),
    [pageId, locale, takeInitialPrompt, status, saving, dirty, aiEnabled, aiOpen, requestBack, save, conflict, resolveConflict, leaveOpen, leave]
  )

  return (
    <div className={cn(styles.editor, 'flex h-[calc(100dvh-4rem)] flex-col')}>
      <PageArchitectProvider value={architect.value}>
        <EditorChromeContext.Provider value={chrome}>
          <LandingPickerProviders metadata={metadata}>
            <Puck
              config={config}
              data={initialData}
              metadata={metadata}
              onChange={onChange}
              onAction={onAction}
              onPublish={handlePublish}
              permissions={architect.permissions}
              headerPath={pageName}
              iframe={IFRAME}
              overrides={OVERRIDES}
              viewports={VIEWPORTS}
            />
          </LandingPickerProviders>
        </EditorChromeContext.Provider>
      </PageArchitectProvider>

      <Sheet open={brandingOpen} onOpenChange={setBrandingOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <IconPalette className="h-5 w-5" aria-hidden />
              {t('editor.branding')}
            </SheetTitle>
            <SheetDescription>{t('editor.brandingDescription')}</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            <BrandingSettingsForm settings={brandingSettings} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
