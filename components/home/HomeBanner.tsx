import Image from "next/image";
import Link from "next/link";
import { useMediaQuery } from "usehooks-ts";

export default function HomeBanner() {


    const matches = useMediaQuery('(min-width: 768px)');
    const width = matches ? 800 : 400;
    const height = matches ? 600 : 300;

    return (
        <div className="hero min-h-screen">
            <div className="hero-content max-w-none flex-col lg:flex-row-reverse lg:justify-around px-10 lg:px-20">
                <Image
                    src="/icons/hero.svg"
                    className="rounded-lg shadow-2xl p-5 "
                    width={width}
                    height={height}
                    alt="Certificate"
                />
                <div className="text-center lg:text-left w-full lg:w-1/3">
                    <h1 className="md:text-8xl text-2xl font-bold">¡El futuro del aprendizaje!</h1>
                    <p className="py-6">
                    En el centro de capacitacion profesional, nuestro objetivo es transformar la forma en que aprendes y adquieres conocimiento. Nuestra plataforma LMS líder en el mercado te ofrece una experiencia de aprendizaje revolucionaria, diseñada para potenciar tu crecimiento personal y profesional. 
                    </p>
                    <Link
                        className="btn-primary btn" 
                        href="/store">
                        
                            Ir a la tienda
                        
                    </Link>
                </div>
            </div>
        </div>
    );
}
