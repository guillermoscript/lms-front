import type { ComponentConfig } from '@measured/puck'
import { cn } from '@/lib/utils'

type FooterLink = {
  label: string
  href: string
}

type FooterColumn = {
  title: string
  links: FooterLink[]
}

type SocialLink = {
  platform: string
  url: string
}

export type FooterProps = {
  description: string
  columns: FooterColumn[]
  socialLinks: SocialLink[]
  copyright: string
}

export const Footer: ComponentConfig<FooterProps> = {
  label: 'Footer',
  fields: {
    description: { type: 'textarea', label: 'Description' },
    columns: {
      type: 'array',
      label: 'Link Columns',
      arrayFields: {
        title: { type: 'text', label: 'Column Title' },
        links: {
          type: 'array',
          label: 'Links',
          arrayFields: {
            label: { type: 'text', label: 'Label' },
            href: { type: 'text', label: 'URL' },
          },
          defaultItemProps: { label: 'Link', href: '#' },
        },
      },
      defaultItemProps: {
        title: 'Column',
        links: [{ label: 'Link 1', href: '#' }],
      },
    },
    socialLinks: {
      type: 'array',
      label: 'Social Links',
      arrayFields: {
        platform: { type: 'text', label: 'Platform (eg Twitter)' },
        url: { type: 'text', label: 'URL' },
      },
      defaultItemProps: { platform: 'Twitter', url: '#' },
    },
    copyright: { type: 'text', label: 'Copyright Text' },
  },
  defaultProps: {
    description: 'Your online academy for professional development and personal growth.',
    columns: [
      { title: 'Courses', links: [{ label: 'All Courses', href: '/courses' }, { label: 'Pricing', href: '/pricing' }] },
      { title: 'Company', links: [{ label: 'About', href: '#about' }, { label: 'Contact', href: '#contact' }] },
      { title: 'Legal', links: [{ label: 'Terms', href: '/terms' }, { label: 'Privacy', href: '/privacy' }] },
    ],
    socialLinks: [],
    copyright: '\u00a9 2026 Academy. All rights reserved.',
  },
  render: ({ description, columns, socialLinks, copyright }) => {
    // Build responsive grid-cols class based on number of link columns + the brand column
    const gridColsClass = cn(
      'grid grid-cols-1 gap-12 mb-12',
      columns.length === 1 && 'md:grid-cols-[2fr_1fr]',
      columns.length === 2 && 'md:grid-cols-[2fr_1fr_1fr]',
      columns.length === 3 && 'md:grid-cols-[2fr_1fr_1fr_1fr]',
      columns.length >= 4 && 'md:grid-cols-[2fr_1fr_1fr_1fr_1fr]'
    )

    return (
      <footer className="bg-card border-t border-border pt-16 pb-8 px-6">
        <div className="mx-auto max-w-screen-xl">
          <div className={gridColsClass}>
            {/* Brand */}
            <div>
              <p className="text-muted-foreground leading-relaxed text-[0.9375rem] max-w-[280px]">
                {description}
              </p>
              {socialLinks.length > 0 && (
                <div aria-label="Social links" className="flex gap-4 mt-6">
                  {socialLinks.map((s, i) => (
                    <a
                      key={i}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground text-sm no-underline transition-colors"
                    >
                      {s.platform}
                    </a>
                  ))}
                </div>
              )}
            </div>
            {/* Link columns */}
            <nav aria-label="Footer" className="contents">
              {columns.map((col, i) => (
                <div key={i}>
                  <h3 className="text-foreground font-semibold text-sm uppercase tracking-wider mb-4">
                    {col.title}
                  </h3>
                  <ul className="list-none p-0 m-0 flex flex-col gap-2">
                    {col.links.map((link, j) => (
                      <li key={j}>
                        <a
                          href={link.href}
                          className="text-muted-foreground hover:text-foreground text-sm no-underline transition-colors truncate underline decoration-transparent hover:decoration-current underline-offset-4 transition-[text-decoration-color,color] duration-300"
                        >
                          {link.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </div>
          {/* Bottom */}
          <div className="border-t border-border pt-6">
            <p className="text-muted-foreground text-sm text-center">
              {copyright}
            </p>
          </div>
        </div>
      </footer>
    )
  },
}
