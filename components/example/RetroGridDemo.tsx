import Image from 'next/image'

import RetroGrid from '@/components/magicui/retro-grid'

export function RetroGridDemo() {
    return (
        <div className="relative flex h-[500px] w-full flex-col items-center justify-center overflow-hidden rounded-lg border bg-background md:shadow-xl">
            <Image
                src="/img/tengo-fe.jpg"
                alt="Mano Tengo Fe"
                width={300}
                height={300}
                className="rounded"
            />
            <RetroGrid />
        </div>
    )
}
