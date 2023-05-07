export default function FAQs() {
    return (
        <section className="bg-secondary-content py-12 w-full">
            <div className="container mx-auto px-6 py-12">
                <h2 className="text-center text-2xl font-semibold text-secondary lg:text-4xl ">
                    Preguntass frecuentes.
                </h2>

                <div className="mt-8 lg:-mx-12 lg:flex xl:mt-16">
                    <TableContent />

                    <div className="mt-8 flex-1 lg:mx-12 lg:mt-0">
                        <Faq />
                    </div>
                </div>
            </div>
        </section>
    );
}

function Faq() {
    return (
        <>
            <div>
                <button className="flex items-center focus:outline-none">
                    <svg
                        className="h-6 w-6 text-accent"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M20 12H4"
                        ></path>
                    </svg>

                    <h1 className="mx-4 text-xl text-secondary">
                        How i can play for my appoinment ?
                    </h1>
                </button>

                <div className="mt-8 flex md:mx-10">
                    <span className="border border-accent"></span>

                    <p className="max-w-3xl px-4 ">
                        Lorem ipsum dolor sit amet consectetur adipisicing elit.
                        Magni, eum quae. Harum officiis reprehenderit ex quia
                        ducimus minima id provident molestias optio nam vel,
                        quidem iure voluptatem, repellat et ipsa.
                    </p>
                </div>
            </div>

            <hr className="my-8 border-primary dark:border-gray-700" />

            <div>
                <button className="flex items-center focus:outline-none">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-6 w-6 text-accent"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 4v16m8-8H4"
                        />
                    </svg>

                    <h1 className="mx-4 text-xl text-secondary">
                        What can i expect at my first consultation ?
                    </h1>
                </button>
            </div>
        </>
    );
}

function TableContent({}) {
    return (
        <>
            <div className="lg:mx-12">
                <h4 className="text-xl font-semibold text-secondary">
                    Tabla de contenido
                </h4>
                <div className="mt-4 space-y-4 lg:mt-8">
                    <a
                        href="#"
                        className="block hover:underline text-secondary hover:text-secondary-focus :focus:underline focus:text-secondary-focus"
                    >
                        General
                    </a>
                </div>
            </div>
        </>
    );
}
