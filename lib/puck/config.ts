import type { Config } from '@measured/puck'

// Primitives
import { Heading } from './components/primitives/heading'
import { TextBlock } from './components/primitives/text'
import { Image } from './components/primitives/image'
import { ButtonBlock } from './components/primitives/button-block'
import { Video } from './components/primitives/video'
import { Divider } from './components/primitives/divider'
import { Spacer } from './components/primitives/spacer'
import { IconBlock } from './components/primitives/icon-block'
import { BadgeBlock } from './components/primitives/badge-block'

// Layout
import { Section } from './components/layout/section'
import { Columns } from './components/layout/columns'
import { Container } from './components/layout/container'
import { Grid } from './components/layout/grid'
import { Card } from './components/layout/card'

// LMS
import { HeroBlock } from './components/lms/hero-block'
import { FeaturesGrid } from './components/lms/features-grid'
import { CourseGrid } from './components/lms/course-grid'
import { PricingTable } from './components/lms/pricing-table'
import { TestimonialGrid } from './components/lms/testimonial-grid'
import { FaqAccordion } from './components/lms/faq-accordion'
import { StatsCounter } from './components/lms/stats-counter'
import { CtaBlock } from './components/lms/cta-block'
import { ContactForm } from './components/lms/contact-form'
import { LogoCloud } from './components/lms/logo-cloud'
import { Banner } from './components/lms/banner'
import { TeamGrid } from './components/lms/team-grid'
import { ImageGallery } from './components/lms/image-gallery'
import { SocialProof } from './components/lms/social-proof'

// Navigation
import { Header } from './components/navigation/header'
import { Footer } from './components/navigation/footer'
import { Navbar } from './components/navigation/navbar'
import { BreadcrumbBlock } from './components/navigation/breadcrumb-block'

const componentDefinitions = {
  // Primitives
  Heading,
  TextBlock,
  Image,
  ButtonBlock,
  Video,
  Divider,
  Spacer,
  IconBlock,
  BadgeBlock,
  // Layout
  Section,
  Columns,
  Container,
  Grid,
  Card,
  // LMS
  HeroBlock,
  FeaturesGrid,
  CourseGrid,
  PricingTable,
  TestimonialGrid,
  FaqAccordion,
  StatsCounter,
  CtaBlock,
  ContactForm,
  LogoCloud,
  Banner,
  TeamGrid,
  ImageGallery,
  SocialProof,
  // Navigation
  Header,
  Footer,
  Navbar,
  BreadcrumbBlock,
}

const categoryDefinitions = {
  primitives: {
    components: [
      'Heading',
      'TextBlock',
      'Image',
      'ButtonBlock',
      'Video',
      'Divider',
      'Spacer',
      'IconBlock',
      'BadgeBlock',
    ] as string[],
  },
  layout: {
    components: ['Section', 'Columns', 'Container', 'Grid', 'Card'] as string[],
  },
  lms: {
    components: [
      'HeroBlock',
      'FeaturesGrid',
      'CourseGrid',
      'PricingTable',
      'TestimonialGrid',
      'FaqAccordion',
      'StatsCounter',
      'CtaBlock',
      'ContactForm',
      'LogoCloud',
      'Banner',
      'TeamGrid',
      'ImageGallery',
      'SocialProof',
    ] as string[],
  },
  navigation: {
    components: ['Header', 'Footer', 'Navbar', 'BreadcrumbBlock'] as string[],
  },
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Translator = { (key: string): string; has: (key: string) => boolean } | any

function translateFieldLabel(label: string, t: Translator): string {
  // Only translate simple keys: alphanumeric with spaces/hyphens/underscores, no dots or special chars
  // Dots are invalid in next-intl keys, and labels like "Small (640px)" or "→" are not translatable
  if (!/^[a-zA-Z][a-zA-Z0-9 _-]*$/.test(label)) return label
  try {
    const key = `fieldLabels.${label}`
    if (typeof t.has === 'function' && !t.has(key)) return label
    return t(key)
  } catch {
    return label
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function translateFields(fields: Record<string, any>, t: Translator): Record<string, any> {
  const translated: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(fields)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const f = { ...(field as any) }
    if (f.label && typeof f.label === 'string') {
      f.label = translateFieldLabel(f.label, t)
    }
    if (f.options && Array.isArray(f.options)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      f.options = f.options.map((opt: any) => ({
        ...opt,
        label: typeof opt.label === 'string' ? translateFieldLabel(opt.label, t) : opt.label,
      }))
    }
    if (f.arrayFields && typeof f.arrayFields === 'object') {
      f.arrayFields = translateFields(f.arrayFields, t)
    }
    translated[key] = f
  }
  return translated
}

export function createPuckConfig(t: Translator): Config {
  const translatedComponents: Config['components'] = {}
  for (const [key, component] of Object.entries(componentDefinitions)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comp = component as any
    translatedComponents[key] = {
      ...comp,
      label: t(`components.${key}`),
      ...(comp.fields ? { fields: translateFields(comp.fields, t) } : {}),
    }
  }

  const translatedCategories: Config['categories'] = {}
  for (const [key, category] of Object.entries(categoryDefinitions)) {
    translatedCategories[key] = {
      ...category,
      title: t(`categories.${key}`),
    }
  }

  return {
    categories: translatedCategories,
    components: translatedComponents,
  }
}

// Default static config (English) for non-i18n usage
export const puckConfig: Config = {
  categories: {
    primitives: {
      title: 'Primitives',
      ...categoryDefinitions.primitives,
    },
    layout: {
      title: 'Layout',
      ...categoryDefinitions.layout,
    },
    lms: {
      title: 'LMS Blocks',
      ...categoryDefinitions.lms,
    },
    navigation: {
      title: 'Navigation',
      ...categoryDefinitions.navigation,
    },
  },
  components: componentDefinitions,
}
