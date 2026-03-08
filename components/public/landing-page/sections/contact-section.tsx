import { IconBrandTwitter, IconBrandFacebook, IconBrandInstagram, IconBrandYoutube, IconBrandLinkedin, IconBrandTiktok, IconBrandGithub, IconMail } from '@tabler/icons-react'
import type { ContactSectionData, SocialPlatform, SectionColors } from '@/lib/landing-pages/types'

interface Props {
  data: ContactSectionData
  colors?: SectionColors
}

const SOCIAL_ICONS: Record<SocialPlatform, React.ComponentType<{ className?: string }>> = {
  twitter: IconBrandTwitter,
  facebook: IconBrandFacebook,
  instagram: IconBrandInstagram,
  youtube: IconBrandYoutube,
  linkedin: IconBrandLinkedin,
  tiktok: IconBrandTiktok,
  github: IconBrandGithub,
}

export function ContactSection({ data, colors }: Props) {
  const headingColor = colors?.heading ?? 'text-white'
  const bodyColor = colors?.body ?? 'text-zinc-400'

  return (
    <div>
      <div className="container mx-auto px-4 md:px-6 max-w-2xl text-center">
        {data.title && (
          <h2 className={`text-2xl md:text-3xl font-bold ${headingColor} mb-3`}>{data.title}</h2>
        )}
        {data.subtitle && (
          <p className={`${bodyColor} mb-8`}>{data.subtitle}</p>
        )}

        {data.email && (
          <a
            href={`mailto:${data.email}`}
            className={`inline-flex items-center gap-2 ${bodyColor} transition-colors mb-8`}
          >
            <IconMail className="w-5 h-5" />
            <span>{data.email}</span>
          </a>
        )}

        {data.socialLinks && data.socialLinks.length > 0 && (
          <div className="flex items-center justify-center gap-4 mt-6">
            {data.socialLinks.map((link, idx) => {
              const Icon = SOCIAL_ICONS[link.platform]
              if (!Icon) return null
              return (
                <a
                  key={idx}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
                  title={link.platform}
                >
                  <Icon className="w-5 h-5" />
                </a>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
