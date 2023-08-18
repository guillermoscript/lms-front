import { forwardRef } from 'react';
import { IndexPageRef, PaginatedDocs } from '../../../../utils/types/common';
import PageTransition from '../../../../components/PageTransition';
import axios, { AxiosResponse } from 'axios';
import { GetServerSidePropsContext } from 'next';
import { Course, Evaluation, Lesson, User } from '../../../../payload-types';
import DashboardLayout from '../../../../components/Dashboard/DashboardLayout';
import DashboardNav from '../../../../components/Dashboard/DashboardNav';
import tryCatch from '../../../../utils/tryCatch';
import { useAuth } from '../../../../components/Auth';
import CourseStats from '../../../../components/Course/CourseStats';
import { apiUrl } from '../../../../utils/env';
import IterableAccordionSection, { IterableAccordion } from '../../../../components/Course/IteableAccordionSection';
import CourseCompletedByUser from '../../../../components/Course/CourseCompletedByUser';
import error from 'next/error';
import Link from 'next/link';

type CoursesProps = {
  data: Course;
  evaluations: Evaluation[];
};

function CoursesPage(props: CoursesProps, ref: IndexPageRef) {
  const { data, evaluations } = props;
  const { user } = useAuth();

  if (!data || !evaluations) {
    return (
      <>
        <PageTransition ref={ref}>
          <DashboardLayout>
            <h1 className="text-5xl font-bold py-4">No se encontró el curso</h1>
          </DashboardLayout>
        </PageTransition>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <PageTransition ref={ref}>
          <DashboardLayout>
            <h1 className="text-5xl font-bold py-4">No se encontró el usuario</h1>
          </DashboardLayout>
        </PageTransition>
      </>
    );
  }

  const teacher = (data.teacher as User)?.firstName + ' ' + (data.teacher as User)?.lastName;
  const exams = evaluations?.filter((value) => value.evaluationType === 'exam');
  const homeworks = evaluations?.filter((value) => value.evaluationType === 'homework');

  return (
    <>
      <PageTransition ref={ref}>
        <DashboardLayout
          NavItems={
            <>
              <DashboardNav
                iterable={data.lessons as Lesson[]}
                link={`/dashboard/course/${data.id}/lesson`}
                idOfParam="lessonId"
                iterableName="Lecciones"
              />
              {evaluations && (
                <>
                  <DashboardNav
                    iterable={exams as Evaluation[]}
                    link={`/dashboard/course/${data.id}/exam`}
                    idOfParam="examnId"
                    iterableName="Examenes"
                  />
                  <DashboardNav
                    iterable={homeworks as Evaluation[]}
                    link={`/dashboard/course/${data.id}/homework`}
                    idOfParam="homeworkId"
                    iterableName="Tareas"
                  />
                </>
              )}
            </>
          }
        >
          <h1 className="text-5xl font-bold py-4">Bienvenido a {data.name}</h1>
          <h4 className="text-xl font-bold mb-6">{data.description}</h4>
          <div className="flex flex-row justify-between mb-6">
            <h4 className="text-xl font-bold">Profesor: {teacher}</h4>
          </div>
          <div className="flex flex-col gap-6 justify-center mb-6">
            <h4 className="text-xl font-bold">Estadisticas del curso</h4>
            <CourseStats exams={exams as Evaluation[]} course={data} userId={user?.id} />
          </div>
          {(data.lessons as Lesson[]).length > 0 && exams?.length > 0 && (
            <div className="flex flex-col gap-6 justify-center mb-6">
              <CourseCompletedByUser
                course={data}
                lessons={data.lessons as Lesson[]}
                exams={exams as Evaluation[]}
                homeworks={homeworks as Evaluation[]}
                userId={user?.id}
              />
            </div>
          )}
          {(data.lessons as Lesson[]).length > 0 && (
            <IterableAccordionSection
              userId={user?.id}
              iterable={data.lessons as Lesson[]}
              course={data}
              iterableKeyValue={{
                singular: 'Lección',
                plural: 'Lecciones',
                link: `/dashboard/course/${data.id}/lesson`,
              }}
            >
              {(data.lessons as Lesson[]).map((iterable) => {
                return (
                  <IterableAccordion
                    userId={user?.id}
                    iterableKeyValue={{
                      singular: 'Lección',
                      plural: 'Lecciones',
                      link: `/dashboard/course/${data.id}/lesson`,
                    }}
                    key={iterable.id}
                    iterable={iterable}
                  />
                );
              })}
            </IterableAccordionSection>
          )}
          {exams?.length > 0 && (
            <>
              <IterableAccordionSection
                userId={user?.id}
                iterable={exams as Evaluation[]}
                course={data}
                iterableKeyValue={{
                  singular: 'Examen',
                  plural: 'Examenes',
                  link: `/dashboard/course/${data.id}/exam`,
                }}
              >
                {(exams as Evaluation[]).map((iterable) => {
                  const isCompletedByUser = iterable?.completedBy
                    ?.map((value) => (typeof value === 'string' ? value : value.id))
                    .find((value) => value === user?.id);

                  const isApprovedByUser: string[] = [];
                  iterable?.approvedBy?.forEach((value) => {
                    if (typeof value === 'string') {
                      isApprovedByUser.push(value);
                    } else {
                      isApprovedByUser.push(value.id);
                    }
                  });
                  const isReprovedByUser: string[] = [];
                  iterable?.reprovedBy?.forEach((value) => {
                    if (typeof value === 'string') {
                      isReprovedByUser.push(value);
                    } else {
                      isReprovedByUser.push(value.id);
                    }
                  });

                  const examnApprovedByUser = {
                    examId: iterable.id,
                    approvedBy: isApprovedByUser,
                  };

                  const examnReprovedByUser = {
                    examId: iterable.id,
                    reprovedBy: isReprovedByUser,
                  };

                  return (
                    <div className="collapse collapse-arrow bg-base-200 my-3" key={iterable.id}>
                      <input type="radio" name="my-accordion-2" />
                      <h4 className="collapse-title text-xl font-medium">
                        {iterable.name}
                        {isCompletedByUser && (
                          <div className="badge badge-info ml-3">
                            <div className="badge-content">Completado</div>
                          </div>
                        )}
                        {examnApprovedByUser?.approvedBy?.includes(user?.id) && (
                          <div className="badge badge-success ml-3">
                            <div className="badge-content">Aprobado</div>
                          </div>
                        )}
                        {examnReprovedByUser?.reprovedBy?.includes(user?.id) && (
                          <div className="badge badge-error ml-3">
                            <div className="badge-content">Reprobado</div>
                          </div>
                        )}
                      </h4>
                      <div className="collapse-content">
                        <Link href={`/dashboard/course/${data.id}/exam/${iterable.id}`}>
                          <a>
                            <p className="text-lg mb-6 link link-accent">{iterable.description}</p>
                          </a>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </IterableAccordionSection>
            </>
          )}
          {homeworks?.length > 0 && (
            <IterableAccordionSection
              userId={user?.id}
              iterable={homeworks as Evaluation[]}
              course={data}
              iterableKeyValue={{
                singular: 'Tarea',
                plural: 'Tareas',
                link: `/dashboard/course/${data.id}/homework`,
              }}
            >
              {(homeworks as Evaluation[]).map((iterable) => {
                return (
                  <IterableAccordion
                    userId={user?.id}
                    iterableKeyValue={{
                      singular: 'Tarea',
                      plural: 'Tareas',
                      link: `/dashboard/course/${data.id}/homework`,
                    }}
                    key={iterable.id}
                    iterable={iterable}
                  />
                );
              })}
            </IterableAccordionSection>
          )}
          {data.lessons?.length === 0 && exams?.length === 0 && homeworks?.length === 0 && (
            <h4 className="text-xl font-bold mb-6">No hay lecciones, examenes o tareas en este curso</h4>
          )}
        </DashboardLayout>
      </PageTransition>
    </>
  );
}

export async function getServerSideProps({ query, req }: GetServerSidePropsContext) {
  const { id } = query;

  const [course, courseError] = await tryCatch<AxiosResponse<Course>>(
    axios.get<Course>(apiUrl + '/api/courses/' + id, {
      withCredentials: true,
      headers: {
        Authorization: `JWT ${req.cookies['payload-token']}`,
      },
    }),
  );

  if (courseError) {
    return {
      props: {},
      redirect: {
        destination: '/dashboard',
        permanent: false,
      },
    };
  }

  return {
    props: {
      data: course ? course.data : null,
      evaluations: course ? course.data.evaluations : null,
    }, // will be passed to the page component as props
  };
}

export default forwardRef(CoursesPage);
