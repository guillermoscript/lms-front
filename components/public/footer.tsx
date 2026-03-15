import { getCurrentTenant } from "@/lib/supabase/tenant";
import { getTranslations } from 'next-intl/server';
import { IconBrandTwitter, IconBrandFacebook, IconBrandInstagram, IconBrandYoutube, IconBrandLinkedin, IconBrandTiktok, IconBrandGithub } from '@tabler/icons-react'
import type { FooterSettings, SocialPlatform } from "@/lib/landing-pages/types";

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001'

const SOCIAL_ICONS: Record<SocialPlatform, React.ComponentType<{ className?: string }>> = {
    twitter: IconBrandTwitter,
    facebook: IconBrandFacebook,
    instagram: IconBrandInstagram,
    youtube: IconBrandYoutube,
    linkedin: IconBrandLinkedin,
    tiktok: IconBrandTiktok,
    github: IconBrandGithub,
}

interface FooterProps {
    footerSettings?: FooterSettings
}

export async function Footer({ footerSettings }: FooterProps = {}) {
    const tenant = await getCurrentTenant();
    const t = await getTranslations('landingPageBuilder.footer');
    const brandName = tenant && tenant.id !== DEFAULT_TENANT_ID ? tenant.name : 'LMS V2';

    // If footerSettings is provided, render custom footer
    if (footerSettings) {
        return (
            <footer className="border-t border-border bg-muted/50 py-12">
                <div className="container mx-auto px-4">
                    <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
                        {/* Brand column */}
                        <div>
                            <h3 className="font-bold text-lg mb-4 text-foreground">{brandName}</h3>
                            {footerSettings.description && (
                                <p className="text-muted-foreground text-sm">{footerSettings.description}</p>
                            )}
                            {footerSettings.socialLinks && footerSettings.socialLinks.length > 0 && (
                                <div className="flex items-center gap-3 mt-4">
                                    {footerSettings.socialLinks.map((link, idx) => {
                                        const Icon = SOCIAL_ICONS[link.platform]
                                        if (!Icon) return null
                                        return (
                                            <a
                                                key={idx}
                                                href={link.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-muted-foreground hover:text-foreground transition-colors"
                                                title={link.platform}
                                            >
                                                <Icon className="w-5 h-5" />
                                            </a>
                                        )
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Custom columns */}
                        {footerSettings.columns?.map((column, idx) => (
                            <div key={idx}>
                                <h4 className="font-semibold text-foreground mb-4">{column.title}</h4>
                                <ul className="space-y-2 text-sm text-muted-foreground">
                                    {column.links?.map((link, linkIdx) => (
                                        <li key={linkIdx}>
                                            <a href={link.href} className="hover:text-foreground transition-colors">
                                                {link.label}
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>

                    <div className="mt-12 pt-8 border-t border-border text-center text-sm text-muted-foreground">
                        {footerSettings.copyrightText || `\u00A9 ${new Date().getFullYear()} ${brandName}. ${t('allRightsReserved')}`}
                    </div>
                </div>
            </footer>
        )
    }

    // Default footer
    return (
        <footer className="border-t border-border bg-muted/50 py-12">
            <div className="container mx-auto px-4">
                <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
                    <div>
                        <h3 className="font-bold text-lg mb-4 text-foreground">{brandName}</h3>
                        <p className="text-muted-foreground text-sm">
                            {t('defaultDescription')}
                        </p>
                    </div>

                    <div>
                        <h4 className="font-semibold text-foreground mb-4">{t('platform')}</h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                            <li><a href="/courses" className="hover:text-foreground transition-colors">{t('courses')}</a></li>
                            <li><a href="/pricing" className="hover:text-foreground transition-colors">{t('pricing')}</a></li>
                            <li><a href="#" className="hover:text-foreground transition-colors">{t('instructors')}</a></li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="font-semibold text-foreground mb-4">{t('company')}</h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                            <li><a href="#" className="hover:text-foreground transition-colors">{t('aboutUs')}</a></li>
                            <li><a href="#" className="hover:text-foreground transition-colors">{t('careers')}</a></li>
                            <li><a href="#" className="hover:text-foreground transition-colors">{t('contact')}</a></li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="font-semibold text-foreground mb-4">{t('legal')}</h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                            <li><a href="#" className="hover:text-foreground transition-colors">{t('privacyPolicy')}</a></li>
                            <li><a href="#" className="hover:text-foreground transition-colors">{t('termsOfService')}</a></li>
                        </ul>
                    </div>
                </div>

                <div className="mt-12 pt-8 border-t border-border text-center text-sm text-muted-foreground">
                    &copy; {new Date().getFullYear()} {brandName}. {t('allRightsReserved')}
                </div>
            </div>
        </footer>
    );
}
