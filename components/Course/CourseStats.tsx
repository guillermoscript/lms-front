import { useQuery } from "react-query";
import { Course, Enrollment, Evaluation, Lesson } from "../../payload-types";
import payloadClient from "../../utils/axiosPayloadInstance";
import SkeletonAcordion from "../Skeletons/SkeletonAcordion";
import { PaginatedDocs } from "../../utils/types/common";

type CourseStatsProps = {
    course: Course;
    userId: string;
    exams: Evaluation[];
}

const getTotalEnrollments = async (courseId: string) => {
    const response = await payloadClient.get<PaginatedDocs<Enrollment>>('/api/enrollments/?where[course][equals]=' + courseId);
    return response.data
}

function CourseTotalsExamns({totalExams}: {totalExams: number}) {

    return (
        <div className="stat">
            <div className="stat-figure text-primary">
            <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                className="inline-block w-8 h-8 stroke-current"
            >
                <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                ></path>
            </svg>
            </div>
            <div className="stat-title">Total Examnes </div>
            <div className="stat-value text-primary">{totalExams}</div>
        </div>
    );

}
function CourseTotalsEnrollments({courseId}: {courseId: string}) {

    const query = useQuery(['totalEnrollments', courseId], () => getTotalEnrollments(courseId))

    if (query.isLoading) {
        return <SkeletonAcordion />
    }

    if (query.isError) {
        return <div>Error</div>
    }

    if (query.isSuccess) {
        return (
        <div className="stat">
            <div className="stat-figure text-primary">
            <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                className="inline-block w-8 h-8 stroke-current"
            >
                <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                ></path>
            </svg>
            </div>
            <div className="stat-title">Total Inscritos </div>
            <div className="stat-value text-primary">{query.data.totalDocs}</div>
            {/* <div className="stat-desc">21% more than last month</div> */}
        </div>
        );
    }

    return null;
}

function CourseTotalLessons({ totalLessons }: { totalLessons: number }) {
    return (
      <div className="stat">
        <div className="stat-figure text-secondary">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            className="inline-block w-8 h-8 stroke-current"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
          </svg>
        </div>
        <div className="stat-title">Total de lecciones </div>
        <div className="stat-value text-secondary">{totalLessons}</div>
        {/* <div className="stat-desc">21% more than last month</div> */}
      </div>
    );
}


function CourseTotalCompleted({ lessonsCompletedByUser, totalLessons }: { lessonsCompletedByUser: number, totalLessons: number }) {

    const percentage = Number(((lessonsCompletedByUser / totalLessons) * 100).toFixed(2));
    const precentageOfRemaining = 100 - percentage;

    return (
        <div className="stat">
            <div className="stat-figure text-secondary">
            {/* <div className="avatar online">
                <div className="w-16 rounded-full">
                <img src="/images/stock/photo-1534528741775-53994a69daeb.jpg" />
                </div>
            </div> */}
            </div>
            <div className="stat-value">{percentage}%</div>
            <div className="stat-title">Porcentaje de avance</div>
            <div className="stat-desc text-secondary">Porcentaje restante: {precentageOfRemaining}%</div>
        </div>
    );
}


export default function CourseStats({ course, userId, exams }: CourseStatsProps) {

    const totalLessons = course?.lessons ? course.lessons.length : 0;
    const totalExams =  exams ? exams.length : 0;

    if (totalLessons === 0) {
        return (
            <div className="stats shadow">
                {/* <CourseTotalsEnrollments 
                    courseId={course.id}
                /> */}
                <CourseTotalLessons 
                    totalLessons={totalLessons}
                />
                <CourseTotalsExamns
                    totalExams={totalExams}
                />
            </div>
        )
    }

    const lessonsOfUser = course?.lessons as Lesson[];
    // const lessonsCompletedByUser = lessonsOfUser?.filter(lesson => {
    //     const listOFUser = lesson?.completedBy as string[];
    //     console.log(lesson?.completedBy)
    //     console.log(listOFUser)
    //     return listOFUser.includes(userId);
    // }).map(lesson => lesson.id).length;

    return (
        <div className="stats shadow">
            {/* <CourseTotalsEnrollments 
                courseId={course.id}
            /> */}
            <CourseTotalLessons 
                totalLessons={totalLessons}
            />
            <CourseTotalsExamns
                totalExams={totalExams}
            />
            {/* <CourseTotalCompleted 
                lessonsCompletedByUser={lessonsCompletedByUser}
                totalLessons={totalLessons}
            /> */}
        </div>
    );
}
