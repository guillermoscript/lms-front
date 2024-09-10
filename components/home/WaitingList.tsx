import { getScopedI18n } from "@/app/locales/server"

export default async function WaitingList() {
    const t = await getScopedI18n('landing.waitingList')
    return (
        <div className="pb-12 lg:pb-24 relative">
            <div className="bg-white dark:bg-black">
                <div className="mx-auto w-full relative z-20 sm:max-w-[40rem]  md:max-w-[48rem] lg:max-w-[64rem] xl:max-w-[80rem] bg-gradient-to-br from-slate-800 dark:from-neutral-900 to-gray-900 sm:rounded-2xl">
                    <div className="relative -mx-6   sm:mx-0 sm:rounded-2xl overflow-hidden px-6  md:px-8 ">
                        <div
                            className="absolute inset-0 w-full h-full opacity-10 bg-noise fade-vignette [mask-image:radial-gradient(#fff,transparent,75%)]"
                            style={{
                                backgroundImage: 'url(/img/noise.webp)',
                                backgroundSize: '30%',
                            }}
                        ></div>
                        <div
                            className="pointer-events-none absolute inset-y-0 right-0 select-none overflow-hidden rounded-2xl"
                            style={{
                                mask: 'radial-gradient(33.875rem 33.875rem at calc(100% - 8.9375rem) 0, white 3%, transparent 70%)',
                            }}
                        ></div>
                        <div className="relative px-6 pb-14 pt-20 sm:px-10 sm:pb-20 lg:px-[4.5rem]">
                            <h2 className="  text-center text-balance mx-auto text-3xl md:text-5xl font-semibold tracking-[-0.015em] text-white">
                                {t('title')}
                            </h2>
                            <p
                                className="mt-4 max-w-[26rem] text-center mx-auto  text-bas
            e/6 text-neutral-200"
                            >
                                <span
                                    data-br=":R1esv9uja:"
                                    data-brr="1"
                                    className="inline-block relative"
                                >
                                    {t('description')}
                                </span>
                            </p>
                            <div className="relative z-10 mx-auto flex justify-center mt-6">
                                <a
                                    href="https://yodxlomcjzw.typeform.com/to/L0FbgHZK"
                                    className="bg-neutral-900 relative z-10 hover:bg-blac
            k/90 border border-transparent text-white text-sm md:text-sm transition font-medium duration-200 rounded-full px-4 py-2 flex items-center justify-center shadow-[0px_-1px_0px_0px_#FFFFFF40_inset,_0px_1px_0px_0px_#FFFFFF40_inset]"
                                >
                                    {t('joinWaitlist')}
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
