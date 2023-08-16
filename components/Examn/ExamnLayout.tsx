import Link from 'next/link';
import { Evaluation, User } from '../../payload-types';
import DashboardLayout from '../Dashboard/DashboardLayout';
import DashboardNav from '../Dashboard/DashboardNav';
import PageTransition from '../PageTransition';
import ExamnHero from './ExamnHero';
import ExamnScore from './ExamnScore';

type ExamnStatusProps = {
  ref: any;
  data: Evaluation;
  courseId: string;
  exams: Evaluation[];
  user: User;
  children: React.ReactNode;
};

export default function ExamnLayout({ ref, data, courseId, exams, user, children }: ExamnStatusProps) {
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
