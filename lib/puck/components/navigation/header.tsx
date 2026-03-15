import type { ComponentConfig } from '@measured/puck'
import { useTranslations } from 'next-intl'
import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { LanguageSwitcher } from '@/components/language-switcher'

type NavLink = {
  label: string
  href: string
}

export type HeaderProps = {
  logo: string
  logoText: string
  navLinks: NavLink[]
  ctaLabel: string
  ctaHref: string
  showLogin: boolean
  showLanguageSwitcher: boolean
  sticky: boolean
  transparent: boolean
}

export const Header: ComponentConfig<HeaderProps> = {
  label: 'Header',
  fields: {
    logo: { type: 'text', label: 'Logo Image URL' },
    logoText: { type: 'text', label: 'Logo Text (fallback)' },
    navLinks: {
      type: 'array',
      label: 'Navigation Links',
      arrayFields: {
        label: { type: 'text', label: 'Label' },
        href: { type: 'text', label: 'URL' },
      },
      defaultItemProps: { label: 'Link', href: '#' },
    },
    ctaLabel: { type: 'text', label: 'CTA Button Label' },
    ctaHref: { type: 'text', label: 'CTA Button URL' },
    showLogin: {
      type: 'radio',
      label: 'Show Login Button',
      options: [
        { label: 'Yes', value: true },
        { label: 'No', value: false },
      ],
    },
    showLanguageSwitcher: {
      type: 'radio',
      label: 'Show Language Switcher',
      options: [
        { label: 'Yes', value: true },
        { label: 'No', value: false },
      ],
    },
    sticky: {
      type: 'radio',
      label: 'Sticky',
      options: [
        { label: 'Yes', value: true },
        { label: 'No', value: false },
      ],
    },
    transparent: {
      type: 'radio',
      label: 'Transparent Background',
      options: [
        { label: 'Yes', value: true },
        { label: 'No', value: false },
      ],
    },
  },
  defaultProps: {
    logo: '',
    logoText: 'Academy',
    navLinks: [
      { label: 'Courses', href: '/courses' },
      { label: 'About', href: '#about' },
      { label: 'Contact', href: '#contact' },
    ],
    ctaLabel: 'Enroll Now',
    ctaHref: '/courses',
    showLogin: true,
    showLanguageSwitcher: true,
    sticky: true,
    transparent: false,
  },
  render: ({ logo, logoText, navLinks, ctaLabel, ctaHref, showLogin, showLanguageSwitcher = true, sticky, transparent }) => {
    const t = useTranslations('puck.render')
    const [user, setUser] = useState<{ id: string } | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
      const supabase = createClient()
      supabase.auth.getUser().then(({ data }) => {
        setUser(data.user ? { id: data.user.id } : null)
        setLoading(false)
      })
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ? { id: session.user.id } : null)
      })
      return () => subscription.unsubscribe()
    }, [])

    const handleSignOut = useCallback(async () => {
      const supabase = createClient()
      await supabase.auth.signOut()
      window.location.href = '/auth/login'
    }, [])

    const isAuthenticated = !loading && user !== null

    return (
      <header
        className={cn(
          'z-50',
          sticky ? 'sticky top-0' : 'relative',
          transparent
            ? 'bg-transparent backdrop-blur-sm'
            : 'bg-background/95 backdrop-blur-sm border-b border-border'
        )}
      >
        <div className="mx-auto max-w-screen-xl flex items-center justify-between px-6 py-3">
          {/* Logo */}
          <a href="/" className="flex items-center gap-2 no-underline">
            {logo ? (
              <img src={logo} alt={logoText || t('home')} className="h-8 object-contain" />
            ) : (
              <span
                className={cn(
                  'text-xl font-bold',
                  transparent ? 'text-white' : 'text-foreground'
                )}
              >
                {logoText || t('home')}
              </span>
            )}
          </a>

          {/* Nav */}
          <nav aria-label="Main navigation" className="flex items-center gap-8">
            {navLinks.map((link, i) => (
              <a
                key={i}
                href={link.href}
                className={cn(
                  'text-sm font-medium no-underline transition-colors truncate relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-current after:transition-all after:duration-300 hover:after:w-full',
                  transparent
                    ? 'text-white/80 hover:text-white'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-3">
            {showLanguageSwitcher && <LanguageSwitcher />}
            {!loading && isAuthenticated ? (
              <>
                <a href="/dashboard" className="no-underline">
                  <Button variant="ghost" size="sm">
                    {t('dashboard')}
                  </Button>
                </a>
                <Button variant="outline" size="sm" onClick={handleSignOut}>
                  {t('logOut')}
                </Button>
              </>
            ) : (
              <>
                {showLogin && (
                  <a href="/auth/login" className="no-underline">
                    <Button variant="ghost" size="sm">
                      {t('logIn')}
                    </Button>
                  </a>
                )}
                {ctaLabel && ctaHref && (
                  <a href={ctaHref} className="no-underline">
                    <Button size="sm">
                      {ctaLabel}
                    </Button>
                  </a>
                )}
              </>
            )}
          </div>
        </div>
      </header>
    )
  },
}
