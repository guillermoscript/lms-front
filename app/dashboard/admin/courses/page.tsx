import dayjs from "dayjs";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { DataTable } from "@/components/ui/Table/data-table";
import { getServerUserRole } from "@/utils/supabase/getUserRole";
import { createClient } from "@/utils/supabase/server";

import { courseCols } from "./courseCols";

export default async function CreateCoursePage() {
  const supabase = createClient();

  const course = await supabase.from("courses").select("*");
  if (course.error != null) {
    console.log(course.error.message);
  }

  console.log(course.data);
  const userRol = await getServerUserRole();

  const rows = course.data?.map((course) => {
    return {
      id: course.course_id,
      title: course.title,
      description: course.description,
      status: course.status,
      date: dayjs(course.created_at).format("DD/MM/YYYY"),
    };
  });

  return (
    <div className=" flex-1 p-8 overflow-auto w-full space-y-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/dashboard/admin">Admin</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink
              className="text-primary-500 dark:text-primary-400"
              href="/dashboard/admin/courses"
            >
              Courses
            </BreadcrumbLink>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <h1 className="text-2xl font-semibold mb-4">
        List And Create product page
      </h1>

      {/* @ts-expect-error: ERR */}
      <DataTable columns={courseCols} data={rows} rol={userRol} />
    </div>
  );
}
