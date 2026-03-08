import type { ComponentConfig } from '@measured/puck'
import { cn } from '@/lib/utils'
import { type SectionSpacingProps, sectionSpacingFields, sectionSpacingDefaults, sectionOuterClass, sectionInnerClass } from '../../utils/section-spacing'

type TeamMemberItem = {
  name: string
  role: string
  bio: string
  avatar: string
}

export type TeamGridProps = {
  title: string
  subtitle: string
  members: TeamMemberItem[]
} & SectionSpacingProps

export const TeamGrid: ComponentConfig<TeamGridProps> = {
  label: 'Team',
  fields: {
    title: { type: 'text', label: 'Title' },
    subtitle: { type: 'textarea', label: 'Subtitle' },
    members: {
      type: 'array',
      label: 'Members',
      arrayFields: {
        name: { type: 'text', label: 'Name' },
        role: { type: 'text', label: 'Role' },
        bio: { type: 'textarea', label: 'Bio' },
        avatar: { type: 'text', label: 'Avatar URL' },
      },
      defaultItemProps: { name: 'Team Member', role: 'Instructor', bio: '', avatar: '' },
    },
    ...sectionSpacingFields,
  },
  defaultProps: {
    ...sectionSpacingDefaults,
    title: 'Meet Our Team',
    subtitle: '',
    members: [
      { name: 'Alex Johnson', role: 'Lead Instructor', bio: 'Full-stack developer with 10+ years of experience.', avatar: '' },
      { name: 'Sarah Chen', role: 'Course Designer', bio: 'Expert in curriculum development and instructional design.', avatar: '' },
      { name: 'David Kim', role: 'AI Specialist', bio: 'Machine learning researcher and educator.', avatar: '' },
    ],
  },
  render: ({ paddingY, paddingX, maxWidth, marginY, title, subtitle, members }) => {
    const spacing = { paddingY, paddingX, maxWidth, marginY }
    if (!members.length) return <></>

    const gridCols = members.length <= 2
      ? 'grid-cols-1 md:grid-cols-2'
      : members.length === 3
        ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
        : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'

    return (
      <div className={sectionOuterClass(spacing)}>
        <div className={sectionInnerClass(spacing)}>
          {title && (
            <h2 className="text-3xl font-bold text-center text-foreground mb-3">{title}</h2>
          )}
          {subtitle && (
            <p className="text-center text-muted-foreground mb-10">{subtitle}</p>
          )}
          <div className={cn('grid gap-8', gridCols)}>
            {members.map((m, i) => (
              <div key={i} className="group text-center">
                <div className="size-24 rounded-full bg-muted mx-auto mb-4 overflow-hidden flex items-center justify-center text-3xl text-muted-foreground transition-transform duration-500 group-hover:scale-105">
                  {m.avatar ? (
                    <img src={m.avatar} alt={m.name} className="w-full h-full object-cover" />
                  ) : (
                    m.name.charAt(0).toUpperCase()
                  )}
                </div>
                <h3 className="font-semibold text-base text-foreground mb-1 truncate">{m.name}</h3>
                <p className="text-sm text-muted-foreground mb-2 truncate">{m.role}</p>
                {m.bio && (
                  <p className="text-[0.8125rem] text-muted-foreground/70 leading-relaxed line-clamp-3">{m.bio}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  },
}
