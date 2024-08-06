'use client'
import Autoplay from 'embla-carousel-autoplay'

import { Carousel, CarouselContent, CarouselNext, CarouselPrevious } from '@/components/ui/carousel'

export default async function CarouselCourse ({
    children
}: {
    children: React.ReactNode
}) {
    return (
        <div className="w-full max-w-xs sm:max-w-screen-sm md:max-w-screen-md lg:max-w-screen-2xl mx-auto px-4">
            <Carousel
                opts={{
                    align: 'start',
                    loop: true,
                    active: true,

                }}
                plugins={[Autoplay()]}
            >
                <CarouselContent className="flex gap-4">
                    {children}
                </CarouselContent>
                <CarouselPrevious />
                <CarouselNext />
            </Carousel>
        </div>
    )
}
