'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  IconArrowLeft,
  IconPlus,
  IconGripVertical,
  IconEye,
  IconEyeOff,
  IconTrash,
  IconLoader2,
  IconDeviceFloppy,
  IconWorldUpload,
  IconChevronRight,
  IconChevronUp,
  IconChevronDown,
  IconSettings,
  IconStack2,
  IconCheck,
} from '@tabler/icons-react'
import type { LandingPage, LandingSection, SectionType } from '@/lib/landing-pages/types'
import { createSection } from '@/lib/landing-pages/section-defaults'
import { updateLandingPage, publishLandingPage } from '@/app/actions/admin/landing-pages'
import { SectionEditor } from './section-editor'
import { SectionPicker } from './section-picker'
import { HeaderFooterEditor } from './editors/header-footer-editor'
import { nanoid } from 'nanoid'
import { useTranslations } from 'next-intl'

type SidebarTab = 'sections' | 'settings'

const SECTION_DOT_COLORS: Record<string, string> = {
  hero: 'bg-blue-400',
  features: 'bg-emerald-400',
  courses: 'bg-amber-400',
  testimonials: 'bg-pink-400',
  faq: 'bg-cyan-400',
  cta: 'bg-orange-400',
  stats: 'bg-violet-400',
  text: 'bg-zinc-400',
  image_text: 'bg-sky-400',
  video: 'bg-red-400',
  pricing: 'bg-green-400',
  team: 'bg-teal-400',
  logo_cloud: 'bg-slate-400',
  gallery: 'bg-fuchsia-400',
  banner: 'bg-yellow-400',
  divider: 'bg-zinc-500',
  contact: 'bg-rose-400',
}

interface Props {
  page: LandingPage
  onBack: (updatedPage?: LandingPage) => void
}

export function LandingPageBuilder({ page: initialPage, onBack }: Props) {
  const t = useTranslations('landingPageBuilder.builder')
  const tLabels = useTranslations('landingPageBuilder.sectionLabels')
  const [page, setPage] = useState<LandingPage>(initialPage)
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    initialPage.sections[0]?.id ?? null
  )
  const [showSectionPicker, setShowSectionPicker] = useState(false)
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('sections')
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  const selectedSection = page.sections.find(s => s.id === selectedSectionId) ?? null

  const handleSaveDraft = useCallback(async () => {
    setSaving(true)
    const result = await updateLandingPage(page.id, {
      name: page.name,
      sections: page.sections,
      settings: page.settings,
    })
    if (result.success && result.data) {
      setPage(result.data)
      setLastSaved(new Date())
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 2000)
    }
    setSaving(false)
  }, [page])

  const handlePublish = useCallback(async () => {
    setPublishing(true)
    await updateLandingPage(page.id, { name: page.name, sections: page.sections, settings: page.settings })
    const result = await publishLandingPage(page.id)
    if (result.success && result.data) {
      setPage(result.data)
    }
    setPublishing(false)
  }, [page])

  function updateSection(updated: LandingSection) {
    setPage(prev => ({
      ...prev,
      sections: prev.sections.map(s => s.id === updated.id ? updated : s),
    }))
  }

  function toggleVisibility(id: string) {
    setPage(prev => ({
      ...prev,
      sections: prev.sections.map(s => s.id === id ? { ...s, visible: !s.visible } : s),
    }))
  }

  function deleteSection(id: string) {
    setPage(prev => ({
      ...prev,
      sections: prev.sections.filter(s => s.id !== id),
    }))
    if (selectedSectionId === id) {
      setSelectedSectionId(page.sections.find(s => s.id !== id)?.id ?? null)
    }
  }

  function addSection(type: SectionType) {
    const newSection = createSection(type)
    setPage(prev => ({ ...prev, sections: [...prev.sections, newSection] }))
    setSelectedSectionId(newSection.id)
    setShowSectionPicker(false)
    setSidebarTab('sections')
  }

  function moveSection(id: string, direction: 'up' | 'down') {
    setPage(prev => {
      const idx = prev.sections.findIndex(s => s.id === id)
      if (idx === -1) return prev
      const newIdx = direction === 'up' ? idx - 1 : idx + 1
      if (newIdx < 0 || newIdx >= prev.sections.length) return prev
      const sections = [...prev.sections]
      ;[sections[idx], sections[newIdx]] = [sections[newIdx], sections[idx]]
      return { ...prev, sections }
    })
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* ─── Top bar ─── */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-background/95 backdrop-blur-sm shrink-0">
        <Button variant="ghost" size="sm" onClick={() => onBack(page)} className="gap-1.5 text-muted-foreground hover:text-foreground">
          <IconArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">{t('back')}</span>
        </Button>

        <div className="h-5 w-px bg-border" />

        <Input
          value={page.name}
          onChange={e => setPage(prev => ({ ...prev, name: e.target.value }))}
          className="h-8 w-52 text-sm font-medium border-transparent bg-transparent hover:bg-accent/50 focus:bg-background focus:border-input transition-colors"
        />

        <div className="flex items-center gap-2 ml-auto">
          {lastSaved && (
            <span className="text-[11px] text-muted-foreground hidden sm:block tabular-nums">
              {justSaved ? (
                <span className="text-emerald-500 flex items-center gap-1">
                  <IconCheck className="w-3 h-3" /> {t('saved')}
                </span>
              ) : (
                <>{t('savedAt', { time: lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}</>
              )}
            </span>
          )}

          <Badge
            variant={page.status === 'published' ? 'default' : 'secondary'}
            className={`text-[10px] ${page.status === 'published' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : ''}`}
          >
            {page.status}
          </Badge>

          <div className="h-5 w-px bg-border hidden sm:block" />

          <Button
            size="sm"
            variant="outline"
            onClick={handleSaveDraft}
            disabled={saving}
            className="h-8 gap-1.5 text-xs"
          >
            {saving ? <IconLoader2 className="w-3.5 h-3.5 animate-spin" /> : <IconDeviceFloppy className="w-3.5 h-3.5" />}
            {t('save')}
          </Button>
          <Button
            size="sm"
            onClick={handlePublish}
            disabled={publishing}
            className="h-8 gap-1.5 text-xs"
          >
            {publishing ? <IconLoader2 className="w-3.5 h-3.5 animate-spin" /> : <IconWorldUpload className="w-3.5 h-3.5" />}
            {t('publish')}
          </Button>
        </div>
      </div>

      {/* ─── Main workspace ─── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ─── Left sidebar ─── */}
        <div className="w-72 shrink-0 border-r flex flex-col overflow-hidden bg-muted/30">
          {/* Tab switcher */}
          <div className="p-2 border-b flex gap-1">
            <button
              className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md transition-all ${
                sidebarTab === 'sections'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setSidebarTab('sections')}
            >
              <IconStack2 className="w-3.5 h-3.5" />
              {t('sections')}
              <span className="text-[10px] tabular-nums opacity-60">({page.sections.length})</span>
            </button>
            <button
              className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md transition-all ${
                sidebarTab === 'settings'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setSidebarTab('settings')}
            >
              <IconSettings className="w-3.5 h-3.5" />
              {t('settings')}
            </button>
          </div>

          {sidebarTab === 'sections' ? (
            <>
              {/* Section list */}
              <div className="flex-1 overflow-y-auto">
                {page.sections.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                    <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mb-3">
                      <IconStack2 className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium">{t('noSections')}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t('noSectionsDescription')}</p>
                  </div>
                ) : (
                  <div className="p-2 space-y-0.5">
                    {page.sections.map((section, idx) => {
                      const isSelected = selectedSectionId === section.id
                      const dotColor = SECTION_DOT_COLORS[section.type] || 'bg-zinc-400'

                      return (
                        <div
                          key={section.id}
                          className={`flex items-center gap-2 rounded-lg px-2.5 py-2 cursor-pointer text-sm transition-all group ${
                            isSelected
                              ? 'bg-background shadow-sm ring-1 ring-border'
                              : 'hover:bg-background/60'
                          } ${!section.visible ? 'opacity-40' : ''}`}
                          onClick={() => setSelectedSectionId(section.id)}
                        >
                          {/* Drag handle + color dot */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <IconGripVertical className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                            <span className={`w-2 h-2 rounded-full ${dotColor} shrink-0`} />
                          </div>

                          {/* Label + index */}
                          <div className="flex-1 min-w-0">
                            <p className="truncate font-medium text-xs">{tLabels(section.type)}</p>
                          </div>

                          {/* Hover actions */}
                          <div className={`flex items-center gap-0.5 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                            <button
                              className="p-1 rounded hover:bg-muted transition-colors"
                              onClick={e => { e.stopPropagation(); moveSection(section.id, 'up') }}
                              title={t('moveUp')}
                              disabled={idx === 0}
                            >
                              <IconChevronUp className={`w-3 h-3 ${idx === 0 ? 'text-muted-foreground/20' : ''}`} />
                            </button>
                            <button
                              className="p-1 rounded hover:bg-muted transition-colors"
                              onClick={e => { e.stopPropagation(); moveSection(section.id, 'down') }}
                              title={t('moveDown')}
                              disabled={idx === page.sections.length - 1}
                            >
                              <IconChevronDown className={`w-3 h-3 ${idx === page.sections.length - 1 ? 'text-muted-foreground/20' : ''}`} />
                            </button>
                            <button
                              className="p-1 rounded hover:bg-muted transition-colors"
                              onClick={e => { e.stopPropagation(); toggleVisibility(section.id) }}
                              title={section.visible ? t('hideSection') : t('showSection')}
                            >
                              {section.visible ? (
                                <IconEye className="w-3 h-3" />
                              ) : (
                                <IconEyeOff className="w-3 h-3" />
                              )}
                            </button>
                            <button
                              className="p-1 rounded hover:bg-muted text-destructive/70 hover:text-destructive transition-colors"
                              onClick={e => { e.stopPropagation(); deleteSection(section.id) }}
                              title={t('deleteSection')}
                            >
                              <IconTrash className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Add section button */}
              <div className="p-2.5 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs h-9 gap-1.5 border-dashed hover:border-solid hover:bg-accent/50 transition-all"
                  onClick={() => setShowSectionPicker(true)}
                >
                  <IconPlus className="w-3.5 h-3.5" />
                  {t('addSection')}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto p-3">
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                {t('settingsDescription')}
              </p>
            </div>
          )}
        </div>

        {/* ─── Right: editor panel ─── */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto p-6">
            {sidebarTab === 'settings' ? (
              <HeaderFooterEditor
                settings={page.settings}
                onChange={(settings) => setPage(prev => ({ ...prev, settings }))}
              />
            ) : selectedSection ? (
              <SectionEditor
                section={selectedSection}
                onChange={updateSection}
              />
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 text-center">
                <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                  <IconStack2 className="w-6 h-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium">{t('noSelection')}</p>
                  <p className="text-muted-foreground text-sm mt-1">
                    {t('noSelectionDescription')}
                  </p>
                </div>
                <Button variant="outline" onClick={() => setShowSectionPicker(true)} className="gap-2">
                  <IconPlus className="w-4 h-4" />
                  {t('addSection')}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <SectionPicker
        open={showSectionPicker}
        onClose={() => setShowSectionPicker(false)}
        onSelect={addSection}
      />
    </div>
  )
}
