import type { ComponentConfig } from '@measured/puck'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { BindingNotice } from './course/course-ui'
import type { LandingTeacher, PuckMetadata } from '../../types'
import { type SectionSpacingProps, sectionSpacingFields, sectionSpacingDefaults, sectionOuterProps, sectionInnerProps } from '../../utils/section-spacing'
import { accentColorField, accentVars } from '../../utils/accent-color'

type TeamMemberItem = {
  name: string
  role: string
  bio: string
  avatar: string
}

export type TeamGridProps = {
  title: string
  subtitle: string
  // 'live' = the school's real teachers only (hidden publicly when there are none);
  // 'manual' = the written `members`. Unset (pages saved before the field existed)
  // keeps the old behaviour: live teachers when any, else the members.
  source?: 'live' | 'manual'
  members: TeamMemberItem[]
  accentColor: string
} & SectionSpacingProps

export const TeamGrid: ComponentConfig<TeamGridProps> = {
  label: 'Team',
  fields: {
    title: { type: 'text', label: 'Title' },
    subtitle: { type: 'textarea', label: 'Subtitle' },
    source: {
      type: 'radio',
      label: 'Source',
      options: [
        { label: 'Live teachers', value: 'live' },
        { label: 'Manual members', value: 'manual' },
      ],
    },
    members: {
      type: 'array',
      label: 'Members',
      arrayFields: {
        name: { type: 'text', label: 'Name' },
        role: { type: 'text', label: 'Role' },
        bio: { type: 'textarea', label: 'Bio' },
        avatar: { type: 'text', label: 'Avatar URL' },
      },
      defaultItemProps: { name: 'Team member name', role: 'Their role', bio: '', avatar: '' },
    },
    accentColor: accentColorField,
    ...sectionSpacingFields,
  },
  defaultProps: {
    ...sectionSpacingDefaults,
    title: 'Meet Our Team',
    subtitle: '',
    accentColor: '',
    source: 'live',
    // Placeholders, never invented people (the TestimonialGrid rule, #739): named
    // instructors with fabricated credentials ("10+ years", "Former Google
    // engineer") were what a school published if it never edited the block. They
    // only show in 'manual' mode, and read as a prompt to the editor.
    members: [
      { name: 'Team member name', role: 'Their role', bio: 'Replace with a short, true bio: what they teach and what they have actually done.', avatar: '' },
      { name: 'Team member name', role: 'Their role', bio: 'Use real people from your school, with their permission.', avatar: '' },
    ],
  },
  render: function TeamGridView({ paddingY, paddingX, maxWidth, marginY, tone, align, anchorId, hideOn, title, subtitle, source, members, accentColor, puck }) {
    const spacing = { paddingY, paddingX, maxWidth, marginY, tone, align, anchorId, hideOn }
    const t = useTranslations('puck.templates.teamGrid')

    // Real tenant teachers resolved server-side and handed in via metadata — never invented
    // people. 'live' shows only those (nothing publicly when there are none yet); 'manual'
    // shows the written members; an unset source keeps the old live-else-members behaviour.
    const live: TeamMemberItem[] = (((puck?.metadata as PuckMetadata | undefined)?.teachers ?? []) as LandingTeacher[])
      .map((teacher) => ({
        name: teacher.name,
        role: '',
        bio: teacher.bio ?? '',
        avatar: teacher.avatar ?? '',
      }))
    const mode = source ?? (live.length > 0 ? 'live' : 'manual')
    const resolvedMembers: TeamMemberItem[] = mode === 'live' ? live : (members ?? [])

    if (!resolvedMembers.length) {
      if (!puck?.isEditing) return <></>
      return <BindingNotice title={t('title')} message={mode === 'live' ? t('noTeachers') : t('noMembers')} />
    }

    const gridCols = resolvedMembers.length <= 2
      ? 'grid-cols-1 md:grid-cols-2'
      : resolvedMembers.length === 3
        ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
        : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'

    return (
      <div {...sectionOuterProps(spacing)}>
        <div {...sectionInnerProps(spacing, accentVars(accentColor))}>
          {title && (
            <h2 className="text-3xl font-bold text-center text-foreground mb-3">{title}</h2>
          )}
          {subtitle && (
            <p className="text-center text-muted-foreground mb-10">{subtitle}</p>
          )}
          {puck?.isEditing && mode === 'manual' && (
            <p role="note" className="mb-6 text-center text-xs text-muted-foreground">{t('manualMembers')}</p>
          )}
          <div className={cn('grid gap-8', gridCols)}>
            {resolvedMembers.map((m, i) => (
              <div key={i} className="group text-center">
                <div className="size-24 rounded-full bg-[color-mix(in_srgb,var(--block-accent)_10%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--block-accent)_18%,transparent)] mx-auto mb-4 overflow-hidden flex items-center justify-center text-3xl font-semibold text-[var(--block-accent-text)] transition-transform motion-reduce:transition-none duration-500">
                  {m.avatar ? (
                    <img src={m.avatar} alt={m.name} className="w-full h-full object-cover" />
                  ) : (
                    m.name.charAt(0).toUpperCase()
                  )}
                </div>
                <h3 className="font-semibold text-base text-foreground mb-1 truncate">{m.name}</h3>
                <p className="text-sm text-[var(--block-accent-text)] font-medium mb-2 truncate">{m.role}</p>
                {m.bio && (
                  <p className="text-[0.8125rem] text-muted-foreground leading-relaxed line-clamp-3">{m.bio}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  },
}
