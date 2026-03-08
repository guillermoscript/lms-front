'use client'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TextField } from './editor-field'
import { IconPlus, IconTrash, IconChevronDown, IconChevronRight } from '@tabler/icons-react'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type {
  LandingPageSettings,
  HeaderSettings,
  FooterSettings,
  NavLink,
  FooterColumn,
  SocialLink,
  SocialPlatform,
} from '@/lib/landing-pages/types'

interface Props {
  settings: LandingPageSettings
  onChange: (settings: LandingPageSettings) => void
}

const PLATFORMS: SocialPlatform[] = ['twitter', 'facebook', 'instagram', 'youtube', 'linkedin', 'tiktok', 'github']

const DEFAULT_HEADER: HeaderSettings = {
  navLinks: [],
  ctaText: '',
  ctaLink: '',
  showLanguageSwitcher: true,
  showLoginButton: true,
}

const DEFAULT_FOOTER: FooterSettings = {
  description: '',
  columns: [],
  socialLinks: [],
  copyrightText: '',
}

export function HeaderFooterEditor({ settings, onChange }: Props) {
  const t = useTranslations('landingPageBuilder.editor.headerFooter')
  const tSeo = useTranslations('landingPageBuilder.editor.seo')
  const tAdv = useTranslations('landingPageBuilder.editor.advanced')
  const [headerOpen, setHeaderOpen] = useState(true)
  const [footerOpen, setFooterOpen] = useState(true)
  const [seoOpen, setSeoOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const header = settings.header || DEFAULT_HEADER
  const footer = settings.footer || DEFAULT_FOOTER

  function updateHeader(updates: Partial<HeaderSettings>) {
    onChange({ ...settings, header: { ...header, ...updates } })
  }

  function updateFooter(updates: Partial<FooterSettings>) {
    onChange({ ...settings, footer: { ...footer, ...updates } })
  }

  // ─── Header nav links ───
  function addNavLink() {
    updateHeader({ navLinks: [...header.navLinks, { label: '', href: '' }] })
  }
  function updateNavLink(idx: number, field: keyof NavLink, value: string) {
    const links = [...header.navLinks]
    links[idx] = { ...links[idx], [field]: value }
    updateHeader({ navLinks: links })
  }
  function removeNavLink(idx: number) {
    updateHeader({ navLinks: header.navLinks.filter((_, i) => i !== idx) })
  }

  // ─── Footer columns ───
  function addFooterColumn() {
    updateFooter({ columns: [...footer.columns, { title: '', links: [] }] })
  }
  function updateColumnTitle(idx: number, title: string) {
    const columns = [...footer.columns]
    columns[idx] = { ...columns[idx], title }
    updateFooter({ columns })
  }
  function removeColumn(idx: number) {
    updateFooter({ columns: footer.columns.filter((_, i) => i !== idx) })
  }
  function addColumnLink(colIdx: number) {
    const columns = [...footer.columns]
    columns[colIdx] = { ...columns[colIdx], links: [...columns[colIdx].links, { label: '', href: '' }] }
    updateFooter({ columns })
  }
  function updateColumnLink(colIdx: number, linkIdx: number, field: keyof NavLink, value: string) {
    const columns = [...footer.columns]
    const links = [...columns[colIdx].links]
    links[linkIdx] = { ...links[linkIdx], [field]: value }
    columns[colIdx] = { ...columns[colIdx], links }
    updateFooter({ columns })
  }
  function removeColumnLink(colIdx: number, linkIdx: number) {
    const columns = [...footer.columns]
    columns[colIdx] = { ...columns[colIdx], links: columns[colIdx].links.filter((_, i) => i !== linkIdx) }
    updateFooter({ columns })
  }

  // ─── Footer social links ───
  function addSocialLink() {
    updateFooter({ socialLinks: [...footer.socialLinks, { platform: 'twitter' as SocialPlatform, url: '' }] })
  }
  function updateSocialLink(idx: number, field: keyof SocialLink, value: string) {
    const links = [...footer.socialLinks]
    links[idx] = { ...links[idx], [field]: value }
    updateFooter({ socialLinks: links })
  }
  function removeSocialLink(idx: number) {
    updateFooter({ socialLinks: footer.socialLinks.filter((_, i) => i !== idx) })
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* ─── HEADER ─── */}
      <div className="border rounded-lg">
        <button
          className="flex items-center gap-2 w-full p-4 text-left font-semibold"
          onClick={() => setHeaderOpen(!headerOpen)}
        >
          {headerOpen ? <IconChevronDown className="w-4 h-4" /> : <IconChevronRight className="w-4 h-4" />}
          {t('headerSettings')}
        </button>
        {headerOpen && (
          <div className="px-4 pb-4 space-y-4 border-t pt-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{t('navLinks')}</p>
                <Button variant="outline" size="sm" onClick={addNavLink}>
                  <IconPlus className="w-3.5 h-3.5 mr-1" /> {t('addLink')}
                </Button>
              </div>
              {header.navLinks.length === 0 && (
                <p className="text-xs text-muted-foreground">{t('noCustomLinks')}</p>
              )}
              {header.navLinks.map((link, idx) => (
                <div key={idx} className="flex items-end gap-2">
                  <TextField label={t('label')} value={link.label} onChange={v => updateNavLink(idx, 'label', v)} placeholder="Courses" className="flex-1" />
                  <TextField label={t('url')} value={link.href} onChange={v => updateNavLink(idx, 'href', v)} placeholder="/courses" className="flex-1" />
                  <button onClick={() => removeNavLink(idx)} className="text-destructive hover:text-destructive/80 pb-2">
                    <IconTrash className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <TextField label={t('ctaButtonText')} value={header.ctaText} onChange={v => updateHeader({ ctaText: v })} placeholder="Join Now" />
              <TextField label={t('ctaButtonLink')} value={header.ctaLink} onChange={v => updateHeader({ ctaLink: v })} placeholder="/auth/sign-up" />
            </div>

            <div className="flex items-center justify-between">
              <Label>{t('showLanguageSwitcher')}</Label>
              <Switch checked={header.showLanguageSwitcher} onCheckedChange={v => updateHeader({ showLanguageSwitcher: v })} />
            </div>
            <div className="flex items-center justify-between">
              <Label>{t('showLoginButton')}</Label>
              <Switch checked={header.showLoginButton} onCheckedChange={v => updateHeader({ showLoginButton: v })} />
            </div>
          </div>
        )}
      </div>

      {/* ─── FOOTER ─── */}
      <div className="border rounded-lg">
        <button
          className="flex items-center gap-2 w-full p-4 text-left font-semibold"
          onClick={() => setFooterOpen(!footerOpen)}
        >
          {footerOpen ? <IconChevronDown className="w-4 h-4" /> : <IconChevronRight className="w-4 h-4" />}
          {t('footerSettings')}
        </button>
        {footerOpen && (
          <div className="px-4 pb-4 space-y-4 border-t pt-4">
            <TextField label={t('footerDescription')} value={footer.description} onChange={v => updateFooter({ description: v })} placeholder="Short description about your school" />
            <TextField label={t('copyrightText')} value={footer.copyrightText} onChange={v => updateFooter({ copyrightText: v })} placeholder="Leave empty for default" />

            {/* Footer columns */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{t('footerColumns')}</p>
                <Button variant="outline" size="sm" onClick={addFooterColumn} disabled={footer.columns.length >= 3}>
                  <IconPlus className="w-3.5 h-3.5 mr-1" /> {t('addColumn')}
                </Button>
              </div>
              {footer.columns.length === 0 && (
                <p className="text-xs text-muted-foreground">{t('noCustomColumns')}</p>
              )}
              {footer.columns.map((col, colIdx) => (
                <div key={colIdx} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <TextField label={t('columnTitle')} value={col.title} onChange={v => updateColumnTitle(colIdx, v)} placeholder="Resources" className="flex-1 mr-2" />
                    <button onClick={() => removeColumn(colIdx)} className="text-destructive hover:text-destructive/80 mt-5">
                      <IconTrash className="w-4 h-4" />
                    </button>
                  </div>
                  {col.links.map((link, linkIdx) => (
                    <div key={linkIdx} className="flex items-end gap-2 pl-2">
                      <TextField label={t('label')} value={link.label} onChange={v => updateColumnLink(colIdx, linkIdx, 'label', v)} placeholder="Link text" className="flex-1" />
                      <TextField label={t('url')} value={link.href} onChange={v => updateColumnLink(colIdx, linkIdx, 'href', v)} placeholder="/page" className="flex-1" />
                      <button onClick={() => removeColumnLink(colIdx, linkIdx)} className="text-destructive hover:text-destructive/80 pb-2">
                        <IconTrash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <Button variant="ghost" size="sm" onClick={() => addColumnLink(colIdx)} className="text-xs">
                    <IconPlus className="w-3 h-3 mr-1" /> {t('addColumnLink')}
                  </Button>
                </div>
              ))}
            </div>

            {/* Social links */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{t('socialLinks')}</p>
                <Button variant="outline" size="sm" onClick={addSocialLink}>
                  <IconPlus className="w-3.5 h-3.5 mr-1" /> {t('addSocialLink')}
                </Button>
              </div>
              {footer.socialLinks.map((link, idx) => (
                <div key={idx} className="flex items-end gap-2">
                  <div className="space-y-1.5 w-36">
                    <Label>{t('platform')}</Label>
                    <Select value={link.platform} onValueChange={v => v && updateSocialLink(idx, 'platform', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PLATFORMS.map(p => (
                          <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <TextField label={t('url')} value={link.url} onChange={v => updateSocialLink(idx, 'url', v)} placeholder="https://..." className="flex-1" />
                  <button onClick={() => removeSocialLink(idx)} className="text-destructive hover:text-destructive/80 pb-2">
                    <IconTrash className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {/* ─── SEO & Meta ─── */}
      <div className="border rounded-lg">
        <button
          className="flex items-center gap-2 w-full p-4 text-left font-semibold"
          onClick={() => setSeoOpen(!seoOpen)}
        >
          {seoOpen ? <IconChevronDown className="w-4 h-4" /> : <IconChevronRight className="w-4 h-4" />}
          {tSeo('title')}
        </button>
        {seoOpen && (
          <div className="px-4 pb-4 space-y-4 border-t pt-4">
            <div>
              <TextField
                label={tSeo('metaTitle')}
                value={settings.metaTitle ?? ''}
                onChange={v => onChange({ ...settings, metaTitle: v || undefined })}
                placeholder={tSeo('metaTitleHint')}
              />
            </div>
            <div>
              <Label className="text-sm font-medium">{tSeo('metaDescription')}</Label>
              <textarea
                value={settings.metaDescription ?? ''}
                onChange={e => onChange({ ...settings, metaDescription: e.target.value || undefined })}
                placeholder={tSeo('metaDescriptionHint')}
                rows={3}
                maxLength={320}
                className="w-full mt-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                {(settings.metaDescription ?? '').length}/160 {tSeo('characters')}
              </p>
            </div>
            <TextField
              label={tSeo('ogImage')}
              value={settings.ogImage ?? ''}
              onChange={v => onChange({ ...settings, ogImage: v || undefined })}
              placeholder={tSeo('ogImageHint')}
            />
          </div>
        )}
      </div>

      {/* ─── Advanced (customCss) ─── */}
      <div className="border rounded-lg">
        <button
          className="flex items-center gap-2 w-full p-4 text-left font-semibold"
          onClick={() => setAdvancedOpen(!advancedOpen)}
        >
          {advancedOpen ? <IconChevronDown className="w-4 h-4" /> : <IconChevronRight className="w-4 h-4" />}
          {tAdv('title')}
        </button>
        {advancedOpen && (
          <div className="px-4 pb-4 space-y-2 border-t pt-4">
            <Label className="text-sm font-medium">{tAdv('customCss')}</Label>
            <textarea
              value={settings.customCss ?? ''}
              onChange={e => onChange({ ...settings, customCss: e.target.value || undefined })}
              placeholder={tAdv('customCssHint')}
              rows={10}
              className="w-full mt-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
              spellCheck={false}
            />
          </div>
        )}
      </div>
    </div>
  )
}
