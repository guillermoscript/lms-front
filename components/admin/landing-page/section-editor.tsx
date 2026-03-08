'use client'

import type { LandingSection, SectionType, SectionStyle } from '@/lib/landing-pages/types'
import { useTranslations } from 'next-intl'
import { SectionStyleEditor } from './editors/section-style-editor'
import { HeroEditor } from './editors/hero-editor'
import { FeaturesEditor } from './editors/features-editor'
import { CoursesEditor } from './editors/courses-editor'
import { TestimonialsEditor } from './editors/testimonials-editor'
import { FaqEditor } from './editors/faq-editor'
import { CtaEditor } from './editors/cta-editor'
import { StatsEditor } from './editors/stats-editor'
import { TextEditor } from './editors/text-editor'
import { ImageTextEditor } from './editors/image-text-editor'
import { VideoEditor } from './editors/video-editor'
import { PricingEditor } from './editors/pricing-editor'
import { TeamEditor } from './editors/team-editor'
import { LogoCloudEditor } from './editors/logo-cloud-editor'
import { GalleryEditor } from './editors/gallery-editor'
import { BannerEditor } from './editors/banner-editor'
import { DividerEditor } from './editors/divider-editor'
import { ContactEditor } from './editors/contact-editor'

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
  section: LandingSection
  onChange: (updated: LandingSection) => void
}

export function SectionEditor({ section, onChange }: Props) {
  const t = useTranslations('landingPageBuilder.editor')
  const tLabels = useTranslations('landingPageBuilder.sectionLabels')

  function updateData(data: Record<string, unknown>) {
    onChange({ ...section, data })
  }

  function updateStyle(style: SectionStyle) {
    onChange({ ...section, style })
  }

  const editorProps = { data: section.data, onChange: updateData }
  const dotColor = SECTION_DOT_COLORS[section.type] || 'bg-zinc-400'

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="flex items-center gap-3">
        <span className={`w-3 h-3 rounded-full ${dotColor} shrink-0`} />
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{tLabels(section.type)}</h2>
          <p className="text-sm text-muted-foreground">{t('editContent')}</p>
        </div>
      </div>

      {/* Section style */}
      <SectionStyleEditor style={section.style} onChange={updateStyle} />

      <div className="h-px bg-border" />

      {section.type === 'hero' && <HeroEditor {...editorProps} />}
      {section.type === 'features' && <FeaturesEditor {...editorProps} />}
      {section.type === 'courses' && <CoursesEditor {...editorProps} />}
      {section.type === 'testimonials' && <TestimonialsEditor {...editorProps} />}
      {section.type === 'faq' && <FaqEditor {...editorProps} />}
      {section.type === 'cta' && <CtaEditor {...editorProps} />}
      {section.type === 'stats' && <StatsEditor {...editorProps} />}
      {section.type === 'text' && <TextEditor {...editorProps} />}
      {section.type === 'image_text' && <ImageTextEditor {...editorProps} />}
      {section.type === 'video' && <VideoEditor {...editorProps} />}
      {section.type === 'pricing' && <PricingEditor {...editorProps} />}
      {section.type === 'team' && <TeamEditor {...editorProps} />}
      {section.type === 'logo_cloud' && <LogoCloudEditor {...editorProps} />}
      {section.type === 'gallery' && <GalleryEditor {...editorProps} />}
      {section.type === 'banner' && <BannerEditor {...editorProps} />}
      {section.type === 'divider' && <DividerEditor {...editorProps} />}
      {section.type === 'contact' && <ContactEditor {...editorProps} />}
    </div>
  )
}
