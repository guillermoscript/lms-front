import { forwardRef, useState } from 'react';
import { IndexPageRef, UserMeResponse } from '../../../../../utils/types/common';
import PageTransition from '../../../../../components/PageTransition';
import axios, { AxiosResponse } from 'axios';
import { GetServerSidePropsContext } from 'next';
import { Course, Lesson, Product, User } from '../../../../../payload-types';
import DashboardLayout from '../../../../../components/Dashboard/DashboardLayout';
import { RichText } from '../../../../../components/RichText';
import LessonCompleteForm from '../../../../../components/Lesson/LessonCompleteForm';
import tryCatch from '../../../../../utils/tryCatch';
import Comments from '../../../../../components/Comments/Comments';
import DashboardNav from '../../../../../components/Dashboard/DashboardNav';
import { apiUrl } from '../../../../../utils/env';
import { useCopyToClipboard } from 'usehooks-ts';
import QAChatModal from '../../../../../components/AI/Modals/QAChatModal';
import useBlockPrintScreen from '../../../../../utils/hooks/useBlockPrintScree';
import ReactDOMServer from 'react-dom/server'

type LessonsProps = {
  data: Lesson;
  user: User;
  lessonId: string;
  courseId: string;
  lessons: Lesson[];
};

function LessonsPage(props: LessonsProps, ref: IndexPageRef) {
  
  const { data, user, lessonId, courseId, lessons } = props;
  const isCompletedByTheUser = data.completedBy?.some((otherUser) => typeof otherUser === 'object' && otherUser.id === user.id);
  const [showModal , setShowModal] = useState<boolean>(false)
  const [value, copy] = useCopyToClipboard()
  useBlockPrintScreen();
  function removeTags(str: string) {
    
    str = str.toString();
    // Regular expression to identify HTML tags in
    // the input string. Replacing the identified
    // HTML tag with a null string.
    return str.replace( /(<([^>]+)>)/ig, '').replace(/\n/g, ' ')
  }  

  const plainText = removeTags(ReactDOMServer.renderToString(<RichText content={data.content} />))

  return (
    <>
      <PageTransition ref={ref}>
        <DashboardLayout NavItems={
          <DashboardNav 
            iterable={lessons as Lesson[]}
            link={`/dashboard/course/${data.id}/lesson`}
            idOfParam="lessonId"
            iterableName="Lecciones"
          />
        }>
          
          {isCompletedByTheUser ? (
            <>
              <div className="indicator mb-4">
                <span className="indicator-item badge-secondary badge badge-success">Completado</span>
                <h1 className="text-5xl font-bold py-16 md:py-8">{data.name}</h1>
              </div>
            </>
          ) : (
            <h1 className="text-5xl font-bold py-16 md:py-8">{data.name}</h1>
          )}

          <div className="flex flex-col">
            <RichText content={data.content} />
          </div>
          
          <button onClick={() => {
            setShowModal(true)
            copy(plainText)
          }} className="btn btn-secondary">
            Preguntar al Profe-bot 🤖
          </button>

          {!isCompletedByTheUser && (
            <LessonCompleteForm lessonId={data.id} user={user} completedBy={typeof data.completedBy === 'object' ? data.completedBy : []} />
          )}
          {data.resources.length > 0 && (
              <div className="flex flex-col">
                <h2 className="text-3xl font-bold py-4">Recursos</h2>
                <div className="flex flex-col">
                  {data.resources.map((resource) => {
                    return <div className="flex flex-col" key={resource.id}>
                      {/* <h3 className="text-2xl font-bold py-4">{resource.name}</h3> */}
                      <RichText content={resource.description} />
                    </div>
                  })}
                </div>
              </div>
            )}
          <Comments
            commentableId={data.id}
            relationTo='lessons'
          />

          {showModal && value && (
            <QAChatModal
              onClose={() => {
                setShowModal(false)
              }}
              value={value as string}
            />
          )}
        </DashboardLayout>
      </PageTransition>
    </>
  );
}

export async function getServerSideProps({ query, req }: GetServerSidePropsContext) {
  const { lessonId, id } = query;

  try {
    // const response = await payloadClient.get<Product>('/api/Lessons/' + lessonId,
    const [response, lessonError] = await tryCatch<AxiosResponse<Lesson>>(
      axios.get(apiUrl + '/api/lessons/' + lessonId, {
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

    const [courseEnrolled, courseEnrolledError] = await tryCatch<AxiosResponse<Course>>(axios.get(
      apiUrl + '/api/enrollments/actives/' + id,
      {
        withCredentials: true,
        headers: {
          Authorization: `JWT ${req.cookies['payload-token']}`,
        },
      },
    ));

    if (lessonError || userError || courseEnrolledError) {
      console.log(lessonError);
      console.log(userError);
      console.log(courseEnrolledError);
      return {
        redirect: {
              destination: '/auth/login',
          permanent: false,
        },
      };
    }

    console.log();

    return {
      props: {
        data: response?.data,
        user: UserMeResponse?.data.user,
        lessonId,
        lessons: courseEnrolled?.data.lessons,
        courseId: id,
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

export default forwardRef(LessonsPage);
