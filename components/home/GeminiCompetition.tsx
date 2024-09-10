import { getScopedI18n } from '@/app/locales/server'

const GeminiSvg = () => (
    <svg
        width="214"
        height="214"
        viewBox="0 0 214 214"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
    >
        <g opacity="0.5" filter="url(#filter0_f_18051_3015)">
            <path
                d="M164.771 106.773C156.816 106.773 149.467 105.266 142.474 102.297C135.477 99.2296 129.304 95.0495 124.129 89.874C118.954 84.6986 114.774 78.5266 111.707 71.5299C108.736 64.5345 107.23 57.1843 107.23 49.2285C107.23 49.1022 107.128 49 107.002 49C106.876 49 106.773 49.1022 106.773 49.2285C106.773 57.1831 105.219 64.532 102.152 71.5299C99.1807 78.5266 95.0501 84.6986 89.8747 89.874C84.7005 95.0495 78.5278 99.2289 71.5318 102.296C64.5358 105.266 57.1843 106.773 49.2285 106.773C49.1022 106.773 49 106.876 49 107.002C49 107.128 49.1022 107.23 49.2285 107.23C57.1824 107.23 64.5339 108.785 71.5318 111.852C78.5291 114.825 84.7011 118.956 89.8747 124.129C95.0501 129.306 99.1813 135.477 102.153 142.476C105.219 149.47 106.773 156.816 106.773 164.771C106.773 164.897 106.876 164.999 107.002 164.999C107.128 164.999 107.23 164.897 107.23 164.771C107.23 156.814 108.736 149.468 111.706 142.476C114.774 135.477 118.953 129.305 124.129 124.129C129.303 118.954 135.474 114.824 142.474 111.852C149.469 108.786 156.818 107.23 164.771 107.23C164.898 107.23 165 107.128 165 107.002C165 106.876 164.898 106.773 164.771 106.773Z"
                fill="url(#paint0_linear_18051_3015)"
            />
        </g>
        <path
            d="M164.771 106.773C156.816 106.773 149.467 105.266 142.474 102.297C135.477 99.2296 129.304 95.0495 124.129 89.874C118.954 84.6986 114.774 78.5266 111.707 71.5299C108.736 64.5345 107.23 57.1843 107.23 49.2285C107.23 49.1022 107.128 49 107.002 49C106.876 49 106.773 49.1022 106.773 49.2285C106.773 57.1831 105.219 64.532 102.152 71.5299C99.1807 78.5266 95.0501 84.6986 89.8747 89.874C84.7005 95.0495 78.5278 99.2289 71.5318 102.296C64.5358 105.266 57.1843 106.773 49.2285 106.773C49.1022 106.773 49 106.876 49 107.002C49 107.128 49.1022 107.23 49.2285 107.23C57.1824 107.23 64.5339 108.785 71.5318 111.852C78.5291 114.825 84.7011 118.956 89.8747 124.129C95.0501 129.306 99.1813 135.477 102.153 142.476C105.219 149.47 106.773 156.816 106.773 164.771C106.773 164.897 106.876 164.999 107.002 164.999C107.128 164.999 107.23 164.897 107.23 164.771C107.23 156.814 108.736 149.468 111.706 142.476C114.774 135.477 118.953 129.305 124.129 124.129C129.303 118.954 135.474 114.824 142.474 111.852C149.469 108.786 156.818 107.23 164.771 107.23C164.898 107.23 165 107.128 165 107.002C165 106.876 164.898 106.773 164.771 106.773Z"
            fill="url(#paint1_linear_18051_3015)"
        />
        <defs>
            <filter
                id="filter0_f_18051_3015"
                x="0"
                y="0"
                width="214"
                height="213.999"
                filterUnits="userSpaceOnUse"
                colorInterpolationFilters="sRGB"
            >
                <feFlood floodOpacity="0" result="BackgroundImageFix" />
                <feBlend
                    mode="normal"
                    in="SourceGraphic"
                    in2="BackgroundImageFix"
                    result="shape"
                />
                <feGaussianBlur
                    stdDeviation="24.5"
                    result="effect1_foregroundBlur_18051_3015"
                />
            </filter>
            <linearGradient
                id="paint0_linear_18051_3015"
                x1="85.1019"
                y1="123.981"
                x2="137.576"
                y2="79.7391"
                gradientUnits="userSpaceOnUse"
            >
                <stop stopColor="#217BFE" />
                <stop offset="0.27" stopColor="#078EFB" />
                <stop offset="0.776981" stopColor="#A190FF" />
                <stop offset="1" stopColor="#BD99FE" />
            </linearGradient>
            <linearGradient
                id="paint1_linear_18051_3015"
                x1="85.1019"
                y1="123.981"
                x2="137.576"
                y2="79.7391"
                gradientUnits="userSpaceOnUse"
            >
                <stop stopColor="#217BFE" />
                <stop offset="0.27" stopColor="#078EFB" />
                <stop offset="0.776981" stopColor="#A190FF" />
                <stop offset="1" stopColor="#BD99FE" />
            </linearGradient>
        </defs>
    </svg>
)

export default async function GeminiHeroSection() {
    const t = await getScopedI18n('landing.geminiCompetition')

    return (
        <section className=" pb-12 lg:pb-32">
            <div className="container mx-auto px-4 text-center">
                <div className="mx-auto relative flex items-center justify-center ">
                    <GeminiSvg />
                </div>
                <h1 className="text-4xl md:text-7xl font-bold mb-6 leading-tight">
                    {t('title')}
                </h1>
                <p className="text-gray-400 text-lg mb-8">
                    {t('description')}
                </p>
                <a
                    href="https://ai.google.dev/competition/projects/lms-ai"
                    className="relative inline-flex h-12 overflow-hidden rounded-full p-[1px] focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 focus:ring-offset-slate-50"
                >
                    <span className="absolute inset-[-1000%] animate-[spin_2s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#E2CBFF_0%,#393BB2_50%,#E2CBFF_100%)]" />
                    <span className="inline-flex h-full w-full cursor-pointer items-center justify-center rounded-full bg-slate-950 px-3 py-1 text-sm font-medium text-white backdrop-blur-3xl">
                        {t('voteForUs')}
                    </span>
                </a>
            </div>
        </section>
    )
}
