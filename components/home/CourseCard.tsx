import Link from "next/link";

export default function CourseCard() {
    return (
        <Link href="/courses/[id]" as={`/courses/${1}`}>
            <a className="rounded-full bg-white/10 px-10 py-3 font-semibold text-white no-underline transition hover:bg-white/20">
                <div className="flex flex-col items-center justify-center gap-4">
                    <div className="flex flex-col items-center justify-center gap-4">
                        <h4 className="text-2xl font-bold text-white">
                            Course Name
                        </h4>
                        <p className="text-2xl font-bold text-white">
                            Course Description
                        </p>
                    </div>
                    <div className="flex items-center justify-between"></div>
                </div>
            </a>
        </Link>
    );
}
