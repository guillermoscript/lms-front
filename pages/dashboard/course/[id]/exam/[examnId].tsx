import axios, { AxiosResponse } from 'axios';
import dayjs from 'dayjs';
import { GetServerSidePropsContext } from 'next';
import DashboardLayout from '../../../../../components/Dashboard/DashboardLayout';
import PageTransition from '../../../../../components/PageTransition';
import { Course, Evaluation, User } from '../../../../../payload-types';
import { IndexPageRef, UserMeResponse } from '../../../../../utils/types/common';
import { useEffect, useState } from 'react';
import tryCatch from '../../../../../utils/tryCatch';
import DashboardNav from '../../../../../components/Dashboard/DashboardNav';
import ExamnHero from '../../../../../components/Examn/ExamnHero';
import { useAuth } from '../../../../../components/Auth';
import { apiUrl } from '../../../../../utils/env';
import { useCountdown } from 'usehooks-ts';
import ExamnComponent from '../../../../../components/Examn/ExamnComponent';
import useBlockPrintScreen from '../../../../../utils/hooks/useBlockPrintScree';
import ExamnLayout from '../../../../../components/Examn/ExamnLayout';

type ExamnPageProps = {
  data: Evaluation;
  evaluations: Evaluation[];
  courseId: string;
  course: Course;
};

function ExamnPage(props: ExamnPageProps, ref: IndexPageRef) {
  const { data, evaluations, courseId, course } = props;

  const { user } = useAuth();
  const [examnStarted, setExamnStarted] = useState<boolean>(false);
  const [windowState, setWindowState] = useState<boolean>(true);

  const now = dayjs();
  const endDate = dayjs(data.endDate);
  const timeLeft = endDate.diff(now, 'second');
  const exams = evaluations?.filter((value) => value.evaluationType === 'exam');

  function isActionTakenByUser(data: any, user: any, action: string): boolean {
    return data[action] ? data[action].find((value: any) => value.id === user?.id) ? true : false : false;
  }
  
  const isApprovedByUser = isActionTakenByUser(data, user, 'approvedBy');
  const isRepovredByUser = isActionTakenByUser(data, user, 'reprovedBy');
  const isCompletedByUser = isActionTakenByUser(data, user, 'completedBy');

  const [isCompleted, setIsCompleted] = useState(isCompletedByUser);

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

  const min = `${parseInt(`${count / 60}`)}:${count % 60}`;

  console.log(isApprovedByUser, 'isApprovedByUser');
  console.log(isRepovredByUser, 'isRepovredByUser');

  function handleFinishExamn() {
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

  // visibilitychange
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

  const examnLayoutProps = {
    ref,
    data,
    courseId: courseId as string,
    exams: exams as Evaluation[],
    user: user as User,
    course: course
  };

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
      <ExamnLayout {...examnLayoutProps}>
        <h2 className="text-2xl font-bold">El examen ha finalizado</h2>
        <p>Si tienes alguna duda, contacta con tu profesor</p>
        {isRepovredByUser && <h2 className="text-2xl font-bold">Lo sentimos, has reprobado el examen</h2>}
        {isApprovedByUser && <h2 className="text-2xl font-bold">Felicidades has aprobado el examen</h2>}
      </ExamnLayout>
    );
  }

  if (isCompleted) {
    return (
      <ExamnLayout {...examnLayoutProps}>
        <h2 className="text-2xl font-bold">Has terminado el examen</h2>
        {timeLeft <= 0 && <h4 className="text-2xl font-bold"> y la fecha de entrega ha finalizado</h4>}
        <p>Si tienes alguna duda, contacta con tu profesor</p>
      </ExamnLayout>
    );
  }

  console.log(course.teacher, 'course')

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
            <ExamnHero 
              course={course}
              data={data}>
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

export async function getServerSideProps({req, query}: GetServerSidePropsContext) {
  const { examnId, id, } = query;

  const [course, courseError] = await tryCatch<AxiosResponse<Course>>(
    axios.get<Course>(apiUrl + '/api/courses/' + id, {
      withCredentials: true,
      headers: {
        Authorization: `JWT ${req.cookies['payload-token']}`,
      },
    }),
  );

  const [UserMeResponse, userError] = await tryCatch<AxiosResponse<UserMeResponse>>(
    axios.get(apiUrl + '/api/users/me', {
      withCredentials: true,
      headers: {
        Authorization: `JWT ${req.cookies['payload-token']}`,
      },
    }),
  );

  
  if (courseError || userError) {
    return {
      redirect: {
        destination: '/auth/login',
        permanent: false,
      },
    };
  }

  const evaluation = (course?.data?.evaluations as Evaluation[])?.find((value) => value.id === examnId);
  const evaluations = course?.data?.evaluations;

  console.log(course?.data.teacher, 'course?.data')

  return {
    props: {
      data: evaluation,
      course: course?.data,
      evaluations: evaluations,
      courseId: id,
    },
  };
}

export default ExamnPage;
