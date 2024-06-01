import Link from 'next/link'

export default function Layout ({ children }: { children: React.ReactNode }) {
    return (
        <>
            {children}
            {/* footer  */}
            <footer className="bg-gray-800 text-white py-4 w-full">
                <div className="container mx-auto px-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <h3 className="text-xl font-bold">Company</h3>
                            <ul className="space-y-2 mt-2">
                                <li>
                                    <Link href="/about">About Us</Link>
                                </li>
                                <li>
                                    <Link href="/contact">Contact Us</Link>
                                </li>
                                <li>
                                    <Link href="/terms">Terms of Service</Link>
                                </li>
                                <li>
                                    <Link href="/privacy">Privacy Policy</Link>
                                </li>
                            </ul>
                        </div>
                        <div>
                            <h3 className="text-xl font-bold">Social</h3>
                            <ul className="space-y-2 mt-2">
                                <li>
                                    <Link href="https://twitter.com">
                                        Twitter
                                    </Link>
                                </li>
                                <li>
                                    <Link href="https://facebook.com">
                                        Facebook
                                    </Link>
                                </li>
                                <li>
                                    <Link href="https://instagram.com">
                                        Instagram
                                    </Link>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </footer>
        </>
    )
}
