import type { Data, Config } from '@measured/puck'

// The Puck data stored in the DB
export type PuckData = Data

// Props types for our custom components
export interface StyleProps {
  backgroundColor?: string
  backgroundImage?: string
  backgroundGradient?: string
  overlayOpacity?: number
  paddingTop?: string
  paddingBottom?: string
  paddingLeft?: string
  paddingRight?: string
  marginTop?: string
  marginBottom?: string
  borderRadius?: string
  borderWidth?: string
  borderColor?: string
  shadow?: 'none' | 'sm' | 'md' | 'lg' | 'xl'
  hideOnMobile?: boolean
  hideOnDesktop?: boolean
}

export interface LinkProps {
  label: string
  href: string
}

export interface CtaProps extends LinkProps {
  variant?: 'solid' | 'outline' | 'ghost'
}

export type PuckConfig = Config

// A course card resolved server-side and handed to dynamic components
// (e.g. CourseGrid) through Puck's `metadata`.
export interface LandingCourse {
  id: string
  title: string
  description: string | null
  image: string | null
  price: number | null
  currency: string | null
}

// Shared metadata passed to <Puck> / <Render>, readable in a component's
// render via `puck.metadata`.
export interface PuckMetadata {
  courses?: LandingCourse[]
  tenantId?: string
}
