'use client'

import { useLocale } from 'next-intl'
import { usePathname, useRouter } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { locales, localeNames, type Locale } from '@/i18n'
import { IconLanguage } from '@tabler/icons-react'

export function LanguageSwitcher() {
  const locale = useLocale() as Locale
  const router = useRouter()
  const pathname = usePathname()

  const handleChange = (newLocale: string | null) => {
    if (!newLocale) return;

    // Remove current locale from pathname
    const pathnameWithoutLocale = pathname.replace(`/${locale}`, '') || '/'

    // Redirect to new locale
    router.push(`/${newLocale}${pathnameWithoutLocale}`)
  }

  return (
    <div className="flex items-center gap-2">
      <IconLanguage className="h-4 w-4 text-muted-foreground" />
      <Select value={locale} onValueChange={handleChange}>
        <SelectTrigger className="w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {locales.map((loc) => (
            <SelectItem key={loc} value={loc}>
              {localeNames[loc]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
