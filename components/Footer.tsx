/**
 * v0 by Vercel.
 * @see https://v0.dev/t/luVJuelPzKU
 * Documentation: https://v0.dev/docs#integrating-generated-code-into-your-nextjs-app
 */
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { FacebookIcon, InstagramIcon, LinkedinIcon, MountainIcon, TwitterIcon } from 'lucide-react'

export default function Footer () {
  return (
    <footer className="w-full bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
      <div className=" container mx-auto px-4 py-12 md:flex md:justify-between md:items-start">
        <div className="mb-8 md:mb-0 md:w-1/3">
          <div className="flex items-center mb-4">
            <MountainIcon className="h-6 w-6 mr-2" />
            <span className="text-lg font-bold">Acme Inc.</span>
          </div>
          <p className="text-sm">
            Empowering businesses with innovative solutions since
            2024.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 md:w-2/3 md:grid-cols-3">
          <div>
            <h4 className="text-lg font-bold mb-4">Quick Links</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="#">Home</Link>
              </li>
              <li>
                <Link href="#">About Us</Link>
              </li>
              <li>
                <Link href="#">Services</Link>
              </li>
              <li>
                <Link href="#">Contact</Link>
              </li>
              <li>
                <Link href="#">Blog</Link>
              </li>
              <li>
                <Link href="#">Privacy Policy</Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-lg font-bold mb-4">Contact</h4>
            <ul className="space-y-2 text-sm">
              <li>123 Main Street, Anytown USA</li>
              <li>Phone: (123) 456-7890</li>
              <li>Email: info@acme.com</li>
            </ul>
            <div className="flex space-x-4 mt-4">
              <Link aria-label="Facebook" href="#">
                <FacebookIcon className="h-5 w-5" />
              </Link>
              <Link aria-label="Twitter" href="#">
                <TwitterIcon className="h-5 w-5" />
              </Link>
              <Link aria-label="LinkedIn" href="#">
                <LinkedinIcon className="h-5 w-5" />
              </Link>
              <Link aria-label="Instagram" href="#">
                <InstagramIcon className="h-5 w-5" />
              </Link>
            </div>
          </div>
          <div>
            <h4 className="text-lg font-bold mb-4">Newsletter</h4>
            <p className="text-sm mb-4">
              Subscribe to our newsletter for the latest updates
              and offers.
            </p>
            <form className="flex space-x-2">
              <Input
                className="flex-1"
                placeholder="Enter your email"
                type="email"
              />
              <Button type="submit">Subscribe</Button>
            </form>
          </div>
        </div>
      </div>
      <div className="bg-gray-200 py-4 text-center text-sm dark:bg-gray-900">
        <p>© 2024 Acme Inc. All rights reserved.</p>
      </div>
    </footer>
  )
}
