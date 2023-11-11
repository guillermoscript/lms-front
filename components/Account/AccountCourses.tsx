import { Course, Enrollment, User } from "../../payload-types";
import payloadClient from "../../utils/axiosPayloadInstance";
import { PaginatedDocs } from "../../utils/types/common";
import SkeletonAcordion from "../Skeletons/SkeletonAcordion";
import { useMediaQuery } from "usehooks-ts";
import Link from "next/link";
import useQueryUserCourses from "./hooks/useQueryUserCourses";

const getUserCourses = async () => {
    const response = await payloadClient.get<PaginatedDocs<Enrollment>>('/api/enrollments');
    return response.data;
}

export default function AccountCourses() {

    const query = useQueryUserCourses();
    const mediaQuery = useMediaQuery('screen and (max-width: 640px)');
    const height = mediaQuery ? 60 : 80;

    if (query.isLoading) {
        return (
            <>
                <div className="py-6">
                    <SkeletonAcordion width="100%" height={height} />
                </div>
                <div className="py-6">
                    <SkeletonAcordion width="100%" height={height} />
                </div>
            </>
        )
    }

    return (
        <section>
            {query.isSuccess && query.data?.docs?.length > 0 && (
                <>
                    <h3 className="text-xl font-medium my-4">Mis cursos</h3>
                    {query.data?.docs?.map((enrollment) => (
                        <MyCoursesList key={enrollment.id} enrollments={enrollment} />
                    ))}
                </>
            )}
            {query.isSuccess && query.data?.docs?.length === 0 && (
                <>
                    <h3 className="text-xl font-medium mb-4">No tienes cursos</h3>
                    <p>Puedes comprar cursos en la tienda</p>
                    <Link
                        className="btn btn-accent mt-4"
                        href="/store">
                        Ir a la tienda
                    </Link>
                </>
            )}
        </section>
    );
}

function MyCoursesList({ enrollments }: { enrollments: Enrollment }) {

    return (
        <div className="collapse collapse-arrow bg-base-200 my-4">
            <input type="radio" name="my-accordion" />
            <div className="collapse-title text-xl font-medium">
                {(enrollments?.course as Course)?.name}
            </div>
            <div className="collapse-content">
                <p>{(enrollments?.course as Course)?.description}</p>
                <Link 
                    className="btn btn-primary mt-4"
                    href={`/dashboard/course/${(enrollments?.course as Course)?.id}`}>
                    Ir al curso
                </Link>
            </div>
        </div>
    )
}