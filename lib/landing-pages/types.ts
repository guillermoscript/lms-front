// Minimal type definitions preserved for the default school navbar/footer components.
// The Puck visual builder doesn't use these — they're only for the fallback SchoolLandingPage layout.

export type SocialPlatform = 'twitter' | 'facebook' | 'instagram' | 'youtube' | 'linkedin' | 'tiktok' | 'github'

export interface HeaderSettings {
  logoUrl?: string
  navLinks?: { label: string; href: string }[]
  ctaText?: string
  ctaLink?: string
  ctaLabel?: string
  ctaHref?: string
  showLanguageSwitcher?: boolean
  showLogin?: boolean
  showLoginButton?: boolean
}

export interface FooterSettings {
  description?: string
  columns?: { title: string; links: { label: string; href: string }[] }[]
  socialLinks?: { platform: SocialPlatform; url: string }[]
  copyright?: string
  copyrightText?: string
}

export interface LandingPageSettings {
  header?: HeaderSettings
  footer?: FooterSettings
  metaTitle?: string
  metaDescription?: string
  ogImage?: string
  customCss?: string
}
