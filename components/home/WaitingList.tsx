import { cn } from '@/utils'

import DotPattern from '../magicui/dot-pattern'
import { buttonVariants } from '../ui/button'

export default function WaitingList() {
    return (
        <section className="w-full py-12 md:py-24 lg:py-32 relative">
            <div className="container grid items-center justify-center gap-4 px-4 text-center md:px-6">
                <div className="space-y-3">
                    <h2 className="text-3xl font-bold tracking-tighter md:text-4xl/tight">Join the waitlist</h2>
                    <p className="mx-auto max-w-[600px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
            Be the first to know when we launch. Enter your name and email below.
                    </p>
                </div>
                <div className="mx-auto w-full max-w-sm space-y-2">
                    <a
                        href='https://yodxlomcjzw.typeform.com/to/HhlfrVhh'
                        className={buttonVariants({ variant: 'default' })}
                    >
                        Sure thing, sign me up!
                    </a>
                </div>
            </div>
            <DotPattern
                className={cn(
                    '[mask-image:radial-gradient(300px_circle_at_center,white,transparent)]'
                )}
            />
        </section>
    )
}
