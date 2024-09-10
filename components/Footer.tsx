'use client'

import { Github, MountainIcon } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

import { Button, buttonVariants } from './ui/button'
import { useChangeLocale, useCurrentLocale, useScopedI18n } from '@/app/locales/client'

export default function Footer() {
    const t = useScopedI18n('footer')

    const locale = useCurrentLocale()
    const changeLocale = useChangeLocale()

    return (
        <footer className="w-full bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
            <div className=" container mx-auto px-4 py-12 md:flex md:justify-between md:items-start">
                <div className="mb-8 md:mb-0 md:w-1/3">
                    <div className="flex items-center mb-4">
                        <MountainIcon className="h-6 w-6 mr-2" />
                        <span className="text-lg font-bold">LMS.</span>
                    </div>
                    <p className="text-sm">
                        {t('copyright')}
                    </p>
                </div>
                <div className="grid grid-cols-2 gap-8 md:w-2/3 md:grid-cols-3">
                    <div>
                        <h4 className="text-lg font-bold mb-4">{t('quickLinks')}</h4>
                        <ul className="space-y-2 text-sm">
                            <li>
                                <Link href="/">{t('home')}</Link>
                            </li>
                            <li>
                                <Link href="/plans">{t('plans')}</Link>
                            </li>
                            <li>
                                <Link href="/store">{t('store')}</Link>
                            </li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="text-lg font-bold mb-4">
                            <a href="https://yodxlomcjzw.typeform.com/to/XGa5b9Zm">
                                {t('contact')}
                            </a>
                        </h4>
                        <ul className="space-y-2 text-sm">
                            <li>Email: rxh41sejl@mozmail.com</li>
                        </ul>
                        <div className="flex space-x-4 mt-4">
                            <Link aria-label="Github" href="https://github.com/guillermoscript">
                                <Github className="h-5 w-5" />
                            </Link>
                        </div>
                    </div>
                    <div>
                        <h4 className="text-lg font-bold mb-4">{t('newsletter')}</h4>
                        <p className="text-sm mb-4">
                            {t('newsletterDescription')}
                        </p>
                        <a
                            className={buttonVariants({ variant: 'default' })}
                            href='https://yodxlomcjzw.typeform.com/to/KkrKaZWu'
                        >
                            {t('subscribe')}
                        </a>
                        <p className="text-sm mt-4">
                            {t('newsletterDisclaimer')}
                        </p>
                    </div>
                </div>
            </div>
            <div className="bg-gray-200 py-4 text-center text-sm dark:bg-gray-900 flex gap-4 items-center justify-center">
                <p className="text-gray-600 dark:text-gray-300">
                    {t('madeWithLove')}
                </p>
                <Image
                    src="/img/tengo-fe.jpg"
                    alt="Mano Tengo Fe"
                    width={52}
                    height={52}
                    className="rounded"
                />
                <div className="flex gap-2">
                    <Button
                        className={`px-2 py-1 rounded`}
                        variant={locale === 'en' ? 'default' : 'outline'}
                        onClick={() => changeLocale('en')}
                    >
                        EN
                    </Button>
                    <Button
                        className={`px-2 py-1 rounded`}
                        variant={locale === 'es' ? 'default' : 'outline'}
                        onClick={() => changeLocale('es')}
                    >
                        ES
                    </Button>
                </div>
            </div>
        </footer>
    )
}
