import LessonForm from "@/components/dashboards/teacher/lessons/LessonForm";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { createClient } from "@/utils/supabase/server";

// Force the page to be dynamic and allow streaming responses up to 30 seconds
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export default async function EditLessonPage({
  params,
}: {
  params: { courseId: string; lessonId: string };
}) {
  const supabase = createClient();
  const lesson = await supabase
    .from("lessons")
    .select("*, courses(*),lessons_ai_tasks(*)")
    .eq("id", params.lessonId)
    .single();

  if (lesson.error != null) {
    console.log(lesson.error.message);
  }
  console.log(params);
  console.log(lesson);
  return (
    <>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/dashboard/teacher">Teacher</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/dashboard/teacher/courses">
              Courses
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink
              href={`/dashboard/teacher/courses/${params.courseId}/`}
            >
              {lesson?.data?.courses?.title}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink
              href={`/dashboard/teacher/courses/${params.courseId}/lessons/${params.lessonId}`}
            >
              {lesson?.data?.title}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink>Edit</BreadcrumbLink>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <LessonForm
        params={params}
        initialValues={{
          title: lesson?.data?.title,
          sequence: lesson?.data?.sequence,
          video_url: lesson?.data?.video_url,
          embed: lesson?.data?.embed_code,
          status: lesson?.data?.status,
          content: lesson?.data?.content,
          description: lesson?.data?.description,
          systemPrompt: lesson?.data.lessons_ai_tasks[0]?.system_prompt,
        }}
      />
    </>
  );
}
