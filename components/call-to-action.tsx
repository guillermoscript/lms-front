import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function CallToAction() {
    return (
        <section className="py-16 md:py-32">
            <div className="mx-auto max-w-5xl px-6">
                <div className="text-center">
                    <h2 className="text-balance text-4xl font-semibold lg:text-5xl">Start Building</h2>
                    <p className="mt-4">Libero sapiente aliquam quibusdam aspernatur.</p>

                    <div className="mt-12 flex flex-wrap justify-center gap-4">
                        <Button size="lg" render={<Link href="/" />} nativeButton={false}><span>Get Started</span></Button>

                        <Button size="lg" variant="outline" render={<Link href="/" />} nativeButton={false}><span>Book Demo</span></Button>
                    </div>
                </div>
            </div>
        </section>
    )
}
