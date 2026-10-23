import type { ComponentType } from 'react'
import {
  Award,
  BarChart3,
  BookOpen,
  Bot,
  Brain,
  Calendar,
  Check,
  CircleHelp,
  Clock,
  Code,
  Compass,
  FileText,
  Folder,
  Globe,
  GraduationCap,
  Heart,
  Layers,
  Lightbulb,
  Lock,
  MessageSquare,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Trophy,
  Users,
  Video,
  Wrench,
  Zap,
} from 'lucide-react'

type IconComponent = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>

/** Icon names a block's `icon` field may use (kebab-case, lucide). */
export const BLOCK_ICONS: Record<string, IconComponent> = {
  award: Award,
  'bar-chart': BarChart3,
  book: BookOpen,
  bot: Bot,
  brain: Brain,
  calendar: Calendar,
  check: Check,
  help: CircleHelp,
  clock: Clock,
  code: Code,
  compass: Compass,
  file: FileText,
  folder: Folder,
  globe: Globe,
  graduation: GraduationCap,
  heart: Heart,
  layers: Layers,
  lightbulb: Lightbulb,
  lock: Lock,
  message: MessageSquare,
  rocket: Rocket,
  search: Search,
  'shield-check': ShieldCheck,
  sparkles: Sparkles,
  star: Star,
  target: Target,
  trophy: Trophy,
  users: Users,
  video: Video,
  wrench: Wrench,
  zap: Zap,
}

/**
 * Renders a block icon. `name` is a known icon name ("sparkles") or, for
 * legacy pages, any short text such as an emoji, which is shown as-is.
 */
export function BlockIcon({ name, className }: { name: string; className?: string }) {
  const Icon = BLOCK_ICONS[name?.trim().toLowerCase()]
  if (Icon) return <Icon className={className} aria-hidden />
  return (
    <span aria-hidden="true" className="leading-none">
      {name}
    </span>
  )
}
