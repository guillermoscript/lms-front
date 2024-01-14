import { Sidebar } from "@/components/dashboard/Sidebar";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

export default async function Dashboard() {

  const cookieStore = cookies()
  const supabase = createClient(cookieStore)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  console.log(user)

  const profile = await supabase
    .from("profiles")
    .select()

    console.log(profile)
  return (
    <>
      <div className="min-h-full flex gap-4 w-full">
        <Sidebar >
        {/* <ul className="flex flex-col gap-2 items-start">
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
        </ul> */}
        </Sidebar>
					<main className="flex-1 p-8 overflow-y-auto">
            {user?.email}
					</main>
      </div>
    </>
  );
}
