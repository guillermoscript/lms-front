import type { ComponentConfig } from '@measured/puck'
import { cn } from '@/lib/utils'

type NavItem = {
  label: string
  href: string
}

export type NavbarProps = {
  links: NavItem[]
  sticky: boolean
  alignment: 'left' | 'center' | 'right'
}

const alignmentMap: Record<string, string> = {
  left: 'justify-start',
  center: 'justify-center',
  right: 'justify-end',
}

export const Navbar: ComponentConfig<NavbarProps> = {
  label: 'Navbar',
  fields: {
    links: {
      type: 'array',
      label: 'Links',
      arrayFields: {
        label: { type: 'text', label: 'Label' },
        href: { type: 'text', label: 'URL' },
      },
      defaultItemProps: { label: 'Link', href: '#' },
    },
    sticky: {
      type: 'radio',
      label: 'Sticky',
      options: [{ label: 'Yes', value: true }, { label: 'No', value: false }],
    },
    alignment: {
      type: 'radio',
      label: 'Alignment',
      options: [
        { label: 'Left', value: 'left' },
        { label: 'Center', value: 'center' },
        { label: 'Right', value: 'right' },
      ],
    },
  },
  defaultProps: {
    links: [
      { label: 'Home', href: '/' },
      { label: 'Courses', href: '/courses' },
      { label: 'About', href: '#about' },
      { label: 'Contact', href: '#contact' },
    ],
    sticky: false,
    alignment: 'center',
  },
  render: ({ links, sticky, alignment }) => {
    if (!links || links.length === 0) return <></>

    return (
      <nav
        aria-label="Navigation"
        className={cn(
          'z-40 bg-background border-b border-border px-6 py-3',
          sticky ? 'sticky top-0' : 'relative'
        )}
      >
        <div
          className={cn(
            'mx-auto max-w-screen-xl flex gap-8',
            alignmentMap[alignment]
          )}
        >
          {links.map((link, i) => (
            <a
              key={i}
              href={link.href}
              className="text-muted-foreground hover:text-foreground text-sm font-medium no-underline transition-colors truncate relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-current after:transition-all after:duration-300 hover:after:w-full"
            >
              {link.label}
            </a>
          ))}
        </div>
      </nav>
    )
  },
}
