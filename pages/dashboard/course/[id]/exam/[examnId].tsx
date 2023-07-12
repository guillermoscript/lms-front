import axios, { AxiosResponse } from 'axios';
import dayjs from 'dayjs';
import { GetServerSidePropsContext } from 'next';
import DashboardLayout from '../../../../../components/Dashboard/DashboardLayout';
import PageTransition from '../../../../../components/PageTransition';
import { Course, Evaluation, User } from '../../../../../payload-types';
import { IndexPageRef, PaginatedDocs } from '../../../../../utils/types/common';
import { useEffect, useState } from 'react';
import tryCatch from '../../../../../utils/tryCatch';
import DashboardNav from '../../../../../components/Dashboard/DashboardNav';
import ExamnHero from '../../../../../components/Examn/ExamnHero';
import { useAuth } from '../../../../../components/Auth';
import ExamnScore from '../../../../../components/Examn/ExamnScore';
import { apiUrl } from '../../../../../utils/env';
import { useCountdown } from 'usehooks-ts';
import Link from 'next/link';
import ExamnComponent from '../../../../../components/Examn/ExamnComponent';
import useBlockPrintScreen from '../../../../../utils/hooks/useBlockPrintScree';

type ExamnPageProps = {
  data: Evaluation;
  evaluations: PaginatedDocs<Evaluation>;
};

function ExamnPage(props: ExamnPageProps, ref: IndexPageRef) {
  const { data, evaluations } = props;

  const { user } = useAuth();
  const [examnStarted, setExamnStarted] = useState<boolean>(false);

  const now = dayjs();
  const endDate = dayjs(data.endDate);
  const timeLeft = endDate.diff(now, 'second');

  const exams = evaluations?.docs?.filter((value) => value.evaluationType === 'exam');
  // @ts-ignore
  const isApprovedByUser = data.approvedBy ? data.approvedBy.find((value) => value.id === user?.id)
      ? true
      : false
    : false;
  // @ts-ignore
  const isRepovredByUser = data.reprovedBy ? data.reprovedBy.find((value) => value.id === user?.id)
      ? true
      : false
    : false;
  // @ts-ignore
  const isCompletedByUser = data.completedBy ? data.completedBy.find((value) => value.id === user?.id)
      ? true
      : false
    : false;
  // const isCompletedByUser = data?.completedBy?.includes(user?.id) ? true : false;
  const [isCompleted, setIsCompleted] = useState(isCompletedByUser);
  const [examnFinished, setExamnFinished] = useState<boolean>(false);

  const getTimeOfExamn = () => {
    if (!data.exam) return 0;

    const timeInMinutes = data?.exam[0].timeToAnswer;
    const timeInSeconds = timeInMinutes * 60;
    return timeInSeconds;
  };

  // const [intervalValue, setIntervalValue] = useState<number>(1000)
  const [count, { startCountdown, stopCountdown, resetCountdown }] = useCountdown({
    countStart: getTimeOfExamn(),
    intervalMs: 1000,
  });
  const [windowState, setWindowState] = useState<boolean>(true);

  const min = `${parseInt(`${count / 60}`)}:${count % 60}`;
  const courseId = typeof data.course === 'string' ? data.course : data?.course?.id;

  console.log(isApprovedByUser, 'isApprovedByUser');
  console.log(isRepovredByUser, 'isRepovredByUser');

  function handleFinishExamn() {
    setExamnFinished(true);
    setIsCompleted(true);
    stopCountdown();
  }

  useEffect(() => {
    if (isCompletedByUser) {
      setIsCompleted(true);
      stopCountdown();
    }
  }, [isCompletedByUser]);

  useEffect(() => {
    if (count <= 0) {
      stopCountdown();
      // setIsCompleted(true)
      setExamnStarted(false);
    }
  }, [count]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setWindowState(false);
        // stopCountdown()
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useBlockPrintScreen();

  if (!data) {
    return (
      <PageTransition ref={ref}>
        <DashboardLayout>
          <div className="flex flex-row justify-between mb-6"></div>
          <div className="flex flex-col justify-center items-center">
            <h1 className="text-2xl font-bold">No se ha encontrado el examen</h1>
          </div>
        </DashboardLayout>
      </PageTransition>
    );
  }

  if (timeLeft <= 0) {
    return (
      <ExamnStatus
        ref={ref}
        data={data}
        courseId={courseId as string}
        exams={exams as Evaluation[]}
        user={user as User}
      >
        <h2 className="text-2xl font-bold">El examen ha finalizado</h2>
        <p>Si tienes alguna duda, contacta con tu profesor</p>
      </ExamnStatus>
    );
  }

  if (isRepovredByUser) {
    return (
      <ExamnStatus
        ref={ref}
        data={data}
        courseId={courseId as string}
        exams={exams as Evaluation[]}
        user={user as User}
      >
        <h2 className="text-2xl font-bold">Lo sentimos, has reprobado el examen</h2>
        <p>Si tienes alguna duda, contacta con tu profesor</p>
      </ExamnStatus>
    );
  }

  if (isApprovedByUser) {
    return (
      <ExamnStatus
        ref={ref}
        data={data}
        courseId={courseId as string}
        exams={exams as Evaluation[]}
        user={user as User}
      >
        <h2 className="text-2xl font-bold">Felicidades has aprobado el examen</h2>
        <p>Si tienes alguna duda, contacta con tu profesor</p>
      </ExamnStatus>
    );
  }

  if (isCompleted && timeLeft <= 0) {
    return (
      <ExamnStatus
        ref={ref}
        data={data}
        courseId={courseId as string}
        exams={exams as Evaluation[]}
        user={user as User}
      >
        <h2 className="text-2xl font-bold">Has terminado el examen</h2>
        <h4 className="text-2xl font-bold"> y la fecha de entrega ha finalizado</h4>
        <p>Si tienes alguna duda, contacta con tu profesor</p>
      </ExamnStatus>
    );
  }

  if (isCompleted) {
    return (
      <ExamnStatus
        ref={ref}
        data={data}
        courseId={courseId as string}
        exams={exams as Evaluation[]}
        user={user as User}
      >
        <h2 className="text-2xl font-bold">Has terminado el examen</h2>
        <p>Si tienes alguna duda, contacta con tu profesor</p>
      </ExamnStatus>
    );
  }

  return (
    <PageTransition ref={ref}>
      <DashboardLayout
        NavItems={
          <DashboardNav
            iterable={exams as Evaluation[]}
            link={`/dashboard/course/${courseId}/exam`}
            idOfParam="examnId"
            iterableName="Examenes"
          />
        }
      >
        {windowState ? (
          <>
            <ExamnHero data={data}>
              <div className="flex flex-col justify-center items-center">
                <p className="text-2xl font-bold my-4">
                  Tendras {data && data.exam && data.exam[0].timeToAnswer} minutos para realizar el examen
                </p>
                <button
                  onClick={() => {
                    startCountdown();
                    setExamnStarted(true);
                  }}
                  disabled={examnStarted}
                  className="btn btn-primary"
                >
                  {examnStarted ? 'Examen iniciado' : 'Iniciar examen'}
                </button>
              </div>
            </ExamnHero>
            <div className="flex flex-row justify-between mb-6"></div>
            {examnStarted && (
              <ExamnComponent data={data} handleFinishExamn={handleFinishExamn} count={count} time={min} />
            )}

            {!examnStarted && count <= 0 && (
              <div className="flex flex-col justify-center items-center">
                <h2 className="text-2xl font-bold">El examen ha finalizado</h2>
                <p> tendras otra oportunidad para realizarlo</p>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col justify-center items-center">
            <h2 className="text-2xl font-bold">El examen ha finalizado</h2>
            <h4 className="text-2xl font-bold text-error"> Has cambiado de pestaña</h4>
            <p> esto se considera como una falta y tendras otra oportunidad para realizarlo</p>
          </div>
        )}
      </DashboardLayout>
    </PageTransition>
  );
}

type ExamnStatusProps = {
  ref: any;
  data: Evaluation;
  courseId: string;
  exams: Evaluation[];
  user: User;
  children: React.ReactNode;
};

function ExamnStatus({ ref, data, courseId, exams, user, children }: ExamnStatusProps) {
  return (
    <PageTransition ref={ref}>
      <DashboardLayout
        NavItems={
          <DashboardNav
            iterable={exams as Evaluation[]}
            link={`/dashboard/course/${courseId}/exam`}
            idOfParam="examnId"
            iterableName="Examenes"
          />
        }
      >
        <ExamnHero data={data}>
          <div className="flex flex-col justify-center items-center">
            {children}
            <div className="flex flex-row justify-center items-center">
              <Link href={`/dashboard/course/${courseId}`}>
                <a className="btn btn-primary mt-4">Volver al curso</a>
              </Link>
            </div>
          </div>
        </ExamnHero>
        <ExamnScore createdBy={user?.id as string} evaluation={data.id} />
      </DashboardLayout>
    </PageTransition>
  );
}

export async function getServerSideProps(context: GetServerSidePropsContext) {
  const { examnId, id } = context.query;

  try {
    // const response = await payloadClient.get('/api/evaluations/6458676b2b88103d5dea92c5', {
    const [response, responseError] = await tryCatch<AxiosResponse<Evaluation>>(
      axios.get(apiUrl + '/api/evaluations/' + examnId, {
        // Make sure to include cookies with fetch
        withCredentials: true,
        headers: {
          Authorization: `JWT ${context.req.cookies['payload-token']}`,
        },
      }),
    );

    const [courseEnrolled, courseEnrolledError] = await tryCatch<AxiosResponse<Course>>(
      axios.get(apiUrl + '/api/enrollments/actives/' + id, {
        withCredentials: true,
        headers: {
          Authorization: `JWT ${context.req.cookies['payload-token']}`,
        },
      }),
    );

    const courseId = typeof response?.data?.course === 'string' ? response?.data?.course : response?.data?.course?.id;

    if (courseEnrolledError || responseError || courseEnrolled?.data.id !== courseId) {
      return {
        redirect: {
          destination: '/auth/login',
          permanent: false,
        },
      };
    }

    if (response?.data.exam?.length === 0) {
      return {
        redirect: {
          destination: '/auth/login',
          permanent: false,
        },
      };
    }

    const [evaluations, evaluationsError] = await tryCatch(
      axios.get<PaginatedDocs<Evaluation>>(apiUrl + '/api/enrollments/course/' + id + '/evaluations', {
        withCredentials: true,
        headers: {
          Authorization: `JWT ${context.req.cookies['payload-token']}`,
        },
      }),
    );

    if (evaluationsError) {
      console.log(evaluationsError);
    }

    return {
      props: {
        data: response?.data,
        evaluations: evaluations?.data,
        // courseEnrolled: courseEnrolled?.data,
      }, // will be passed to the page component as props
    };
  } catch (error) {
    console.log(error);
    return {
      props: {
        data: null,
      }, // will be passed to the page component as props
    };
  }
}

export default ExamnPage;
