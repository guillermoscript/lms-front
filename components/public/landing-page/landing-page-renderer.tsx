import type { LandingSection } from '@/lib/landing-pages/types'
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
}

export function LandingPageRenderer({ sections, accentColor }: Props) {
  return (
    <div className="flex flex-col min-h-screen bg-[#0A0A0A]">
      {sections
        .filter(s => s.visible)
        .map(section => (
          <SectionRenderer key={section.id} section={section} accentColor={accentColor} />
        ))}
    </div>
  )
}

// Server component wrapper that dispatches to the right section
function SectionRenderer({ section, accentColor }: { section: LandingSection; accentColor?: string }) {
  const d = section.data as any

  switch (section.type) {
    case 'hero':
      return <HeroSection data={d} accentColor={accentColor} />
    case 'features':
      return <FeaturesSection data={d} />
    case 'courses':
      return <CoursesSection data={d} accentColor={accentColor} />
    case 'testimonials':
      return <TestimonialsSection data={d} />
    case 'faq':
      return <FaqSection data={d} />
    case 'cta':
      return <CtaSection data={d} accentColor={accentColor} />
    case 'stats':
      return <StatsSection data={d} />
    case 'text':
      return <TextSection data={d} />
    case 'image_text':
      return <ImageTextSection data={d} />
    case 'video':
      return <VideoSection data={d} />
    case 'pricing':
      return <PricingSection data={d} accentColor={accentColor} />
    case 'team':
      return <TeamSection data={d} />
    case 'logo_cloud':
      return <LogoCloudSection data={d} />
    case 'gallery':
      return <GallerySection data={d} />
    case 'banner':
      return <BannerSection data={d} />
    case 'divider':
      return <DividerSection data={d} />
    case 'contact':
      return <ContactSection data={d} />
    default:
      return null
  }
}
