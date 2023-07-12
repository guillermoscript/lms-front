import Link from "next/link";

export default function NoActiveCourseMessage() {
    return (
        <div className="flex flex-col py-8 items-center justify-center w-full h-full">
            <h3 className="text-xl font-medium mb-4">No tienes cursos activos, no puedes usar el chat</h3>
            <p>Puedes comprar cursos en la tienda</p>
            <Link href="/store">
                <a className="btn btn-accent mt-4">Ir a la tienda</a>
            </Link>
        </div>
    )
}