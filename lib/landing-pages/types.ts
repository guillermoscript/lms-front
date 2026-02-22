export type SectionType =
  | 'hero'
  | 'features'
  | 'courses'
  | 'testimonials'
  | 'faq'
  | 'cta'
  | 'stats'
  | 'text'
  | 'image_text'
  | 'video'
  | 'pricing'
  | 'team'
  | 'logo_cloud'
  | 'gallery'
  | 'banner'
  | 'divider'
  | 'contact'

export interface LandingSection {
  id: string
  type: SectionType
  visible: boolean
  data: Record<string, unknown>
}

// ─── Per-section data types ───────────────────────────────────────────────────

export interface HeroSectionData {
  title: string
  subtitle: string
  ctaText: string
  ctaLink: string
  secondaryCtaText: string
  secondaryCtaLink: string
  backgroundImage: string
  alignment: 'left' | 'center' | 'right'
}

export interface FeatureItem {
  icon: string
  title: string
  description: string
}

export interface FeaturesSectionData {
  title: string
  subtitle: string
  columns: 2 | 3 | 4
  items: FeatureItem[]
}

export interface CoursesSectionData {
  title: string
  subtitle: string
  layout: 'grid' | 'carousel'
  maxItems: number
  showPrice: boolean
}

export interface TestimonialItem {
  name: string
  role: string
  quote: string
  avatar: string
}

export interface TestimonialsSectionData {
  title: string
  subtitle: string
  items: TestimonialItem[]
}

export interface FaqItem {
  question: string
  answer: string
}

export interface FaqSectionData {
  title: string
  subtitle: string
  items: FaqItem[]
}

export interface CtaSectionData {
  title: string
  subtitle: string
  ctaText: string
  ctaLink: string
  style: 'gradient' | 'solid' | 'outline'
}

export interface StatItem {
  value: string
  label: string
}

export interface StatsSectionData {
  title: string
  items: StatItem[]
}

export interface TextSectionData {
  title: string
  content: string
}

export interface ImageTextSectionData {
  title: string
  content: string
  imageSrc: string
  imageAlt: string
  imagePosition: 'left' | 'right'
}

export interface VideoSectionData {
  title: string
  subtitle: string
  videoUrl: string
}

export interface PricingSectionData {
  title: string
  subtitle: string
  showProducts: boolean
}

export interface TeamMember {
  name: string
  role: string
  bio: string
  avatar: string
}

export interface TeamSectionData {
  title: string
  subtitle: string
  items: TeamMember[]
}

// ─── New section data types ──────────────────────────────────────────────────

export interface LogoCloudItem {
  name: string
  logoUrl: string
  href: string
}

export interface LogoCloudSectionData {
  title: string
  subtitle: string
  items: LogoCloudItem[]
}

export interface GalleryItem {
  src: string
  alt: string
  caption: string
}

export interface GallerySectionData {
  title: string
  subtitle: string
  columns: 2 | 3 | 4
  items: GalleryItem[]
}

export interface BannerSectionData {
  text: string
  ctaText: string
  ctaLink: string
  style: 'info' | 'warning' | 'urgent' | 'celebration'
  countdownDate: string
}

export interface DividerSectionData {
  style: 'line' | 'space' | 'dots' | 'gradient'
  height: 'sm' | 'md' | 'lg'
}

export interface ContactSectionData {
  title: string
  subtitle: string
  email: string
  showForm: boolean
  socialLinks: SocialLink[]
}

// ─── Header / Footer settings ────────────────────────────────────────────────

export interface NavLink {
  label: string
  href: string
}

export interface HeaderSettings {
  navLinks: NavLink[]
  ctaText: string
  ctaLink: string
  showLanguageSwitcher: boolean
  showLoginButton: boolean
}

export interface FooterColumn {
  title: string
  links: NavLink[]
}

export type SocialPlatform = 'twitter' | 'facebook' | 'instagram' | 'youtube' | 'linkedin' | 'tiktok' | 'github'

export interface SocialLink {
  platform: SocialPlatform
  url: string
}

export interface FooterSettings {
  description: string
  columns: FooterColumn[]
  socialLinks: SocialLink[]
  copyrightText: string
}

// ─── Page-level ───────────────────────────────────────────────────────────────

export interface LandingPageSettings {
  metaTitle?: string
  metaDescription?: string
  ogImage?: string
  customCss?: string
  header?: HeaderSettings
  footer?: FooterSettings
}

export interface LandingPage {
  id: string
  tenant_id: string
  name: string
  slug: string
  sections: LandingSection[]
  settings: LandingPageSettings
  is_active: boolean
  status: 'draft' | 'published'
  created_at: string
  updated_at: string
}

export interface LandingPageTemplate {
  id: string
  name: string
  description: string | null
  thumbnail_url: string | null
  category: 'general' | 'education' | 'creative' | 'business'
  sections: LandingSection[]
  settings: LandingPageSettings
  sort_order: number
}

export const SECTION_LABELS: Record<SectionType, string> = {
  hero: 'Hero Banner',
  features: 'Features Grid',
  courses: 'Courses',
  testimonials: 'Testimonials',
  faq: 'FAQ',
  cta: 'Call to Action',
  stats: 'Stats / Numbers',
  text: 'Text Block',
  image_text: 'Image + Text',
  video: 'Video',
  pricing: 'Pricing Cards',
  team: 'Team / Instructors',
  logo_cloud: 'Logo Cloud',
  gallery: 'Image Gallery',
  banner: 'Announcement Banner',
  divider: 'Divider',
  contact: 'Contact',
}
