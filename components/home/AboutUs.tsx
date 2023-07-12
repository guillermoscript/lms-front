import Image from "next/image";

export default function AboutUs() {
    return (
        <>
            <div className="w-full bg-base-200 py-16">
                <div className="container m-auto px-6 md:px-12 xl:px-6">
                    <div className="space-y-6 md:flex md:gap-6 md:space-y-0 lg:items-center lg:gap-12">
                        <div className="md:5/12 lg:w-5/12">
                            <Image
                                src="/icons/undraw_professor.svg"
                                className="rounded-lg bg-transparent p-5"
                                width={800}
                                height={600}
                                alt="Certificate"
                            />
                        </div>
                        <div className="md:7/12 lg:w-6/12">
                            <h2 className="text-2xl font-bold text-secondary md:text-4xl lg:text-5xl">
                                Quienes somos
                            </h2>
                            <p className="mt-6">
                                Zowie, centro de formación, ofrece una
                                alternativa para personas tituladas en otras
                                profesiones que trabajan en el sector educativo.
                                Les permite trabajar utilizando las estrategias
                                necesarias para que el aprendizaje sea
                                significativo en los alumnos que asisten al
                                aula.
                            </p>
                            <p className="mt-4">
                                {" "}
                                Considera que es una buena opción para
                                desarrollar capacidades específicas en un corto
                                periodo de tiempo. Además, aumenta las
                                posibilidades de inserción laboral.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
            <div className="w-full bg-base-200 py-16">
                <div className="container m-auto px-6 md:px-12 xl:px-6">
                    <div className="space-y-6 md:flex md:gap-6 md:space-y-0 lg:items-center lg:gap-12">
                        <div className="md:7/12 lg:w-6/12">
                            <h2 className="text-2xl font-bold text-secondary md:text-4xl lg:text-5xl">
                                Que ofrecemos
                            </h2>
                            <p className="mt-6">
                                El objetivo de este proyecto es dotar a los
                                profesores de las herramientas necesarias para
                                poder aplicar los conocimientos adquiridos en el
                                aula a través de sus alumnos. Además, pretende
                                dotar a las personas de los conocimientos
                                necesarios para poder gestionar el marketing
                                digital de una marca o producto en las redes
                                sociales. aula.
                            </p>
                        </div>
                        <div className="md:5/12 lg:w-5/12">
                            <Image
                                src="/icons/undraw_educator.svg"
                                className="rounded-lg bg-transparent p-5"
                                width={800}
                                height={600}
                                alt="Certificate"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
