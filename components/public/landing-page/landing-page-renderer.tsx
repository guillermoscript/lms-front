import type { LandingSection, LandingPageSettings, SectionColors } from '@/lib/landing-pages/types'
import { resolveSectionColors, resolveSectionClasses, resolveSectionBgStyle, sanitizeCss } from '@/lib/landing-pages/style-utils'
import { HeroSection } from './sections/hero-section'
import { FeaturesSection } from './sections/features-section'
import { CoursesSection } from './sections/courses-section'
import { TestimonialsSection } from './sections/testimonials-section'
import { FaqSection } from './sections/faq-section'
import { CtaSection } from './sections/cta-section'
import { StatsSection } from './sections/stats-section'
import { TextSection } from './sections/text-section'
import { ImageTextSection } from './sections/image-text-section'
import { VideoSection } from './sections/video-section'
import { PricingSection } from './sections/pricing-section'
import { TeamSection } from './sections/team-section'
import { LogoCloudSection } from './sections/logo-cloud-section'
import { GallerySection } from './sections/gallery-section'
import { BannerSection } from './sections/banner-section'
import { DividerSection } from './sections/divider-section'
import { ContactSection } from './sections/contact-section'

interface Props {
  sections: LandingSection[]
  accentColor?: string
  settings?: LandingPageSettings
}

export function LandingPageRenderer({ sections, accentColor, settings }: Props) {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-background focus:text-foreground">
        Skip to content
      </a>
      {settings?.customCss && (
        <style dangerouslySetInnerHTML={{ __html: sanitizeCss(settings.customCss) }} />
      )}
      <main id="main-content">
        {sections
          .filter(s => s.visible)
          .map(section => {
            const theme = section.style?.theme ?? 'dark'
            const colors = resolveSectionColors(theme, accentColor)
            const { paddingClass, maxWidthClass, bgClass } = resolveSectionClasses(section.style)
            const bgStyle = resolveSectionBgStyle(section.style, accentColor)
            const overlay = section.style?.backgroundImage
              ? (section.style.backgroundOverlay ?? 50)
              : 0

            return (
              <section
                key={section.id}
                className={`relative ${paddingClass} ${bgClass}`}
                style={bgStyle}
              >
                {overlay > 0 && (
                  <div
                    className="absolute inset-0 z-0"
                    aria-hidden="true"
                    style={{ backgroundColor: `rgba(0,0,0,${overlay / 100})` }}
                  />
                )}
                <div className={`relative z-10 mx-auto px-4 sm:px-6 lg:px-8 ${maxWidthClass}`}>
                  <SectionRenderer
                    section={section}
                    accentColor={accentColor}
                    colors={colors}
                  />
                </div>
              </section>
            )
          })}
      </main>
    </div>
  )
}

function SectionRenderer({
  section,
  accentColor,
  colors,
}: {
  section: LandingSection
  accentColor?: string
  colors: SectionColors
}) {
  const d = section.data as any

  switch (section.type) {
    case 'hero':
      return <HeroSection data={d} accentColor={accentColor} colors={colors} />
    case 'features':
      return <FeaturesSection data={d} accentColor={accentColor} colors={colors} />
    case 'courses':
      return <CoursesSection data={d} accentColor={accentColor} colors={colors} />
    case 'testimonials':
      return <TestimonialsSection data={d} colors={colors} />
    case 'faq':
      return <FaqSection data={d} colors={colors} />
    case 'cta':
      return <CtaSection data={d} accentColor={accentColor} colors={colors} />
    case 'stats':
      return <StatsSection data={d} colors={colors} />
    case 'text':
      return <TextSection data={d} colors={colors} />
    case 'image_text':
      return <ImageTextSection data={d} colors={colors} />
    case 'video':
      return <VideoSection data={d} colors={colors} />
    case 'pricing':
      return <PricingSection data={d} accentColor={accentColor} colors={colors} />
    case 'team':
      return <TeamSection data={d} colors={colors} />
    case 'logo_cloud':
      return <LogoCloudSection data={d} colors={colors} />
    case 'gallery':
      return <GallerySection data={d} colors={colors} />
    case 'banner':
      return <BannerSection data={d} colors={colors} />
    case 'divider':
      return <DividerSection data={d} colors={colors} />
    case 'contact':
      return <ContactSection data={d} colors={colors} />
    default:
      return null
  }
}
