import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/utils";
import { createClient } from "@/utils/supabase/server";
import { FaceIcon } from "@radix-ui/react-icons";
import { cookies } from "next/headers";
import Link from "next/link";
import { Separator } from "../ui/separator";

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
	children?: React.ReactNode;
}

export async function Sidebar({ className, children }: SidebarProps) {
	
	const cookieStore = cookies();
	const supabase = createClient(cookieStore);
	const {
		data: { user },
	} = await supabase.auth.getUser();

	return (
		<div className={cn("py-6 px-4 border-r border-neutral-300 hidden md:block overflow-y-auto", className)}>
			<div className="flex flex-col gap-4">
				
					<Link
						href="/dashboard/account"
						className={buttonVariants({
							variant: "outline",
						})}
					>
						<h2 className="mb-2 px-4 text-lg font-semibold text-left tracking-tight">
							Mis Cursos
						</h2>
						<FaceIcon />
					</Link>
					{user?.id && (
						<FetchAndDisplaySideBarData
							user={user}
							tableName="courses"
							selectQuery="*, course_enrollments ( id, user_id, course_id )"
							eqQuery="course_enrollments.user_id"
							hrefPrefix="/dashboard/courses/"
						/>
					)}
				<Separator />
				{/* <div className="px-3 py-2">
					<h2 className="mb-2 px-4 text-lg font-semibold tracking-tight">
						Mis examenes
					</h2>
					{user?.id && (
						<FetchAndDisplaySideBarData
							user={user}
							tableName="tests"
							selectQuery="*, courses ( id, course_enrollments ( id, user_id, course_id ) )"
							eqQuery="courses.course_enrollments.user_id"
							hrefPrefix="/dashboard//"
						/>
					)}
				</div> */}
				{children}
			</div>
			
		</div>
	);
}
async function FetchAndDisplaySideBarData({
	user,
	tableName,
	selectQuery,
	eqQuery,
	hrefPrefix,
}: {
	user: any;
	tableName: string;
	selectQuery: string;
	eqQuery: string;
	hrefPrefix: string;
}) {
	console.log(user);

	const cookieStore = cookies();
	const supabase = createClient(cookieStore);
	const myEnrollments = await supabase
		.from(tableName)
		.select(selectQuery)
		.eq(eqQuery, user.id)
		.limit(5);

	console.log(myEnrollments.data);

	return (
		<ul className="flex flex-col gap-2 items-start">
			{myEnrollments.data?.map((course: any) => {
				return (
					<li key={course.id} className="flex items-center gap-2">
						<Link
							href={`${hrefPrefix}${course.id}`}
							className={buttonVariants({ variant: "link" })}
						>
							{course.title}
						</Link>
					</li>
				);
			})}
		</ul>
	);
}
