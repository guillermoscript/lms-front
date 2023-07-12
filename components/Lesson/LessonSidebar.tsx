import Link from "next/link";

type ListDashboardProps = {
    icon: React.ReactNode;
    courseId: string;
    lessonId: string;
    title: string;
};



function ListCourseLessons({ courseId, title, lessonId }: ListDashboardProps) {

    return (
      <>
        <Link
            href={`/dahsboard/course/${courseId}/lessons/${lessonId}`}

        >
        </Link>
        <a
          className="group flex items-center rounded-lg p-2 text-base font-normal transition duration-75 hover:bg-secondary-content"
        >
          <span className="text-secondary transition duration-75 focus:text-secondary-focus">
            {title}
          </span>
        </a>
      </>
    );
}