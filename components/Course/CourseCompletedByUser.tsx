import { Lesson, Evaluation, Course } from '../../payload-types';
import CourseCompleteForm from './CourseCompleteForm';

export default function CourseCompletedByUser({
  lessons,
  exams,
  homeworks,
  userId,
  course
}: {
  lessons: Lesson[];
  exams: Evaluation[];
  homeworks: Evaluation[];
  userId: string;
  course: Course;
}) {
  const totalLessons = lessons?.length;
  const totalExams = exams?.length;
  const totalHomeworks = homeworks?.length;

  const totalCompletedLessons = lessons?.filter((value) =>
    value.completedBy?.map((value) => (typeof value === 'string' ? value : value.id)).find((value) => value === userId),
  ).length;
  const totalApprovedExams = exams?.filter((value) =>
    value.completedBy?.map((value) => (typeof value === 'string' ? value : value.id)).find((value) => value === userId),
  ).length;
  const totalCompletedHomeworks = homeworks?.filter((value) =>
    value.completedBy?.map((value) => (typeof value === 'string' ? value : value.id)).find((value) => value === userId),
  ).length;

  console.log(totalApprovedExams)

  const totalCompleted = totalCompletedLessons + totalApprovedExams + totalCompletedHomeworks;
  const total = totalLessons + totalExams + totalHomeworks;

  const isAlreadyCompleted = course?.completedBy?.map((value) => (typeof value === 'string' ? value : value.id)).find((value) => value === userId);

  if (totalCompleted === total) {
    return (
        <>
            <div className="badge badge-success">
                <div className="badge-content">Completado</div>
            </div>
            {
                isAlreadyCompleted ? null : <CourseCompleteForm 
                userId={userId}
                completedBy={course.completedBy}
                courseId={course.id} />
            }
        </>
    );
  }

  return null
}
