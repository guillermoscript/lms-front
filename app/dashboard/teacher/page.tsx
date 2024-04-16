import { Sidebar } from "@/components/dashboard/Sidebar";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";

export default function TeacherPage() {
	return (
		<>
			<Sidebar>
				<Link
					className={`${buttonVariants({
						variant: "link",
					})} text-left`}
					href={`/dashboard/teachers/courses/`}
				>
					Mis cursos
				</Link>
                <Link
                    className={`${buttonVariants({
                        variant: "link",
                    })} text-left`}
                    href={`/dashboard/teachers/tests/`}
                >
                    Mis pruebas
                </Link>
			</Sidebar>
			<main className="flex-1 p-8 overflow-y-auto w-full">
				<h1 className="text-3xl pb-5 font-semibold text-left tracking-tight">
					Mis cursos
				</h1>
			</main>
		</>
	);
}
