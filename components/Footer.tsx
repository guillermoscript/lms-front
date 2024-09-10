/**
 * v0 by Vercel.
 * @see https://v0.dev/t/luVJuelPzKU
 * Documentation: https://v0.dev/docs#integrating-generated-code-into-your-nextjs-app
 */
import { Github, MountainIcon } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

import { buttonVariants } from './ui/button'

export default function Footer () {
    return (
        <footer className="w-full bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
            <div className=" container mx-auto px-4 py-12 md:flex md:justify-between md:items-start">
                <div className="mb-8 md:mb-0 md:w-1/3">
                    <div className="flex items-center mb-4">
                        <MountainIcon className="h-6 w-6 mr-2" />
                        <span className="text-lg font-bold">LMS.</span>
                    </div>
                    <p className="text-sm">
            Building the future of education. © 2024.
                    </p>
                </div>
                <div className="grid grid-cols-2 gap-8 md:w-2/3 md:grid-cols-3">
                    <div>
                        <h4 className="text-lg font-bold mb-4">Quick Links</h4>
                        <ul className="space-y-2 text-sm">
                            <li>
                                <Link href="/">Home</Link>
                            </li>
                            <li>
                                <Link href="/plans">Plans</Link>
                            </li>
                            <li>
                                <Link href="/store">Store</Link>
                            </li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="text-lg font-bold mb-4">
                            <a href="https://yodxlomcjzw.typeform.com/to/XGa5b9Zm">
                Contact
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
                        <h4 className="text-lg font-bold mb-4">Newsletter</h4>
                        <p className="text-sm mb-4">
              Subscribe to our newsletter for the latest updates
              and offers.
                        </p>
                        <a
                            className={buttonVariants({ variant: 'default' })}
                            href='https://yodxlomcjzw.typeform.com/to/KkrKaZWu'
                        >
                Subscribe
                        </a>
                    </div>
                </div>
            </div>
            <div className="bg-gray-200 py-4 text-center text-sm dark:bg-gray-900 flex gap-4 items-center justify-center">
                <p className="text-gray-600 dark:text-gray-300">
                    Made with ❤️ and faith
                </p>
                <Image
                    src="/img/tengo-fe.jpg"
                    alt="Mano Tengo Fe"
                    width={52}
                    height={52}
                    className="rounded"
                />
            </div>
        </footer>
    )
}
