import AccordionArrow, { AccordionArrowProps } from "../Accordion/AccordionArrow";

export default function FAQs() {
    return (
        <section className="bg-secondary-content py-12 w-full">
            <div className="container mx-auto px-6 py-12">
                <h2 className="text-center text-2xl font-semibold text-secondary lg:text-4xl mb-4">
                    Preguntass frecuentes.
                </h2>
                <Faq />
            </div>
        </section>
    );
}

const faq: AccordionArrowProps[] = [
    {
        title: '¿Qué es un curso?',
        content: (
            <>
                <p>
                    Un curso es un conjunto de lecciones que te ayudarán a
                    aprender un tema en específico.
                </p>
            </>
        ),
        name: 'faq',
    },
    {
        title: '¿Qué es una lección?',
        content: (
            <>
                <p>
                    Una lección es una unidad de aprendizaje que contiene
                    información sobre un tema en específico.
                </p>
            </>
        ),
        name: 'faq',
    },
    {
        title: '¿Qué es una tarea?',
        content: (
            <>
                <p>
                    Una tarea es un ejercicio que te ayudará a reforzar lo
                    aprendido en una lección.
                </p>
            </>
        ),
        name: 'faq',
    },
    {
        title: '¿Qué es un examen?',
        content: (
            <>
                <p>
                    Un examen es una evaluación que te ayudará a medir tu
                    aprendizaje.
                </p>
            </>
        ),
        name: 'faq',
    },
    {
        title: '¿Qué es un certificado?',
        content: (
            <>
                <p>
                    Un certificado es un documento que te acredita haber
                    completado un curso.
                </p>
            </>
        ),
        name: 'faq',
    },
]

function Faq() {

    return (
        <>
            {faq.map((item, index) => (
                <AccordionArrow 
                    key={index}
                    title={item.title}
                    content={item.content}
                    name="faq"
                />
            ))}
        </>
    );
}
