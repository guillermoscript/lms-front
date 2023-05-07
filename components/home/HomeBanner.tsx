import Image from "next/image";

export default function HomeBanner() {
    return (
        <div className="hero min-h-screen bg-base-200">
            <div className="hero-content max-w-none flex-col lg:flex-row-reverse lg:justify-around px-10 lg:px-20">
                <Image
                    src="/icons/group_video.svg"
                    className="rounded-lg shadow-2xl p-5 dark:bg-base-100"
                    width={800}
                    height={600}
                    alt="Certificate"
                />
                <div className="text-center lg:text-left w-full lg:w-1/3">
                    <h1 className="text-8xl font-bold">Box Office News!</h1>
                    <p className="py-6">
                        Provident cupiditate voluptatem et in. Quaerat fugiat ut
                        assumenda excepturi exercitationem quasi. In deleniti
                        eaque aut repudiandae et a id nisi.
                    </p>
                    <button className="btn-primary btn">Get Started</button>
                </div>
            </div>
        </div>
    );
}
