import Link from "next/link"
import SkeletonAcordion from "../Skeletons/SkeletonAcordion"
import useQueryUserCourses from "./hooks/useQueryUserCourses"
import { Course } from "../../payload-types"

export default function AccountNavBar() {

    const query = useQueryUserCourses()

    if (query.isLoading) {
        return (
            <>
            <div className="py-6">
                <SkeletonAcordion width="100%" height={60} />
            </div>
            <div className="py-6">
                <SkeletonAcordion width="100%" height={60} />
            </div>
        </>
        )
    }

    if (query.isSuccess && query.data?.docs?.length > 0) {
        return (
            <>
            <li className="text-xl font-medium my-4">
                Mis cursos
            </li>
                <li>
                    <details open>
                    <summary>Cursos activos</summary>
                    <ul>
                        {query.data?.docs?.map((enrollment) => (
                            <li key={enrollment.id} className="lis">
                                <Link href={`/dashboard/course/${(enrollment?.course as Course)?.id}`}>
                                    <a className="group flex items-center rounded-lg p-2 text-base font-normal transition duration-75 hover:bg-secondary-content">
                                        <span className="text-secondary transition duration-75 focus:text-secondary-focus">
                                            {(enrollment?.course as Course)?.name}
                                        </span>
                                    </a>
                                </Link>
                            </li>
                        ))}
                    </ul>
                    </details>
                </li>
            </>
        )
    }

    if (query.isSuccess && query.data?.docs?.length === 0) {
        return (
            <>
                <h3 className="text-xl font-medium mb-4">No tienes cursos</h3>
                <p>Puedes comprar cursos en la tienda</p>
                <Link href="/store">
                    <a className="btn btn-accent mt-4">Ir a la tienda</a>
                </Link>
            </>
        )
    } 
    
    return null
}