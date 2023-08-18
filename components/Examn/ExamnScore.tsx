import { Examn, ExamnsSubmission } from '../../payload-types';
import { RichText } from '../RichText';
import SkeletonComments from '../Skeletons/SkeletonComments';
import useQueryExamnSubmission from './hooks/useQueryExamnSubmission';

type ExamnScoreProps = {
  createdBy: string;
  evaluation: string;
};

export default function ExamnScore({ createdBy, evaluation }: ExamnScoreProps) {
  const query = useQueryExamnSubmission({ createdBy, evaluation });

  console.log(query.isSuccess ? query.data?.docs[0].submissionData : null);
  return (
    <div className="flex flex-col mb-4">
      <div className="flex flex-row flex-wrap">
        {query.isLoading ? <SkeletonComments /> : null}
        {query.isSuccess ? (
          query.data?.docs[0] ? (
            <ExamnReviewContent
              // score={query.data?.docs[0]?.score || 'pendiente'}
              // teacherComments={query.data?.docs[0].teacherComments}
              // gptResponse={query.data?.docs[0].gptResponse as string}
              // questions={query.data?.docs[0]?.form?.fields }
              // answers={query.data?.docs[0].submissionData}
              data={query.data?.docs[0]}
            />
          ) : (
            <div className="flex flex-col">
              <h1 className="text-2xl font-bold"> Tu examen aun no ha sido revisado</h1>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}

type ExamnResult = {
  finalScore: number;
  finalComment: string;
  examn: {
    score: number;
    comment: string;
  }[];
};

type ExamnReviewContentProps = {
  questions: Array<{
    name: string;
    label: string;
    id: string;
    blockType: string;
  }>;
  answers: Array<{
    field: string;
    value: string;
    id: string;
  }>;
};

function ExamnReviewContent({ data }: { data: ExamnsSubmission }) {
  const { score, teacherComments, gptResponse } = data;
  const answers = data.submissionData;
  const questionsData = data.form as Examn;
  const questions = questionsData.fields;

  if (!gptResponse)
    return (
      <div className="flex flex-col">
        <h4 className="text-xl font-bold mb-6">Examen</h4>
        <h2 className="text-2xl font-bold mb-4">Calificación: {score}</h2>
        <h3 className="text-xl font-bold mb-4">Comentarios del profesor</h3>
        {teacherComments ? (
          <RichText content={teacherComments} />
        ) : (
          <p className="text-lg font-bold mb-4">No hay comentarios del profesor</p>
        )}
      </div>
    );

  const gptResponseParsed = JSON.parse(gptResponse as string) as ExamnResult;

  const scoreColor = score
    ? score < 10
      ? 'text-red-500'
      : score < 15
      ? 'text-yellow-500'
      : 'text-green-500'
    : 'text-gray-500';
  const finalScoreColor =
    gptResponseParsed.finalScore < 10
      ? 'text-red-500'
      : gptResponseParsed.finalScore < 15
      ? 'text-yellow-500'
      : 'text-green-500';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col bg-base-200 rounded-lg shadow-md p-4">
        <h2 className="text-2xl font-bold mb-4">
          Calificación: <span className={scoreColor}>{score}</span>
        </h2>
        <h3 className="text-xl font-bold mb-4">Comentarios del profesor</h3>
        {teacherComments ? (
          <RichText content={teacherComments} />
        ) : (
          <p className="text-lg font-bold mb-4">No hay comentarios del profesor</p>
        )}
      </div>
      <div className="flex flex-col bg-base-200 rounded-lg shadow-md p-4">
        <h3 className="text-xl font-bold mb-4">Comentarios de Profebot 🤖</h3>
        <p className="text-lg font-bold mb-4">{gptResponseParsed.finalComment}</p>
        <p className={`text-lg font-bold mb-4 ${finalScoreColor}`}>
          Calificación final de Profebot: {gptResponseParsed.finalScore}
        </p>
      </div>
      <div className="flex flex-col">
        {gptResponseParsed.examn.map((examn, index: number) => {
          const questionsDefined = questions ? [index] : null;
          const answersDefined = answers ? [index] : null;

          return (
            <div key={index} className="flex flex-col bg-base-300 rounded-lg p-4 shadow-md my-4">
              <ul>
                <li className="font-bold mb-2">Pregunta: {(questionsDefined as any)?.label}</li>
                <li className="mb-2">Tu Respuesta: {(answersDefined as any)?.value}</li>
                <li className="mb-2">
                  Calificación:{' '}
                  <span
                    className={
                      examn.score < 10 ? 'text-red-500' : examn.score < 15 ? 'text-yellow-500' : 'text-green-500'
                    }
                  >
                    {examn.score}
                  </span>
                </li>
                <li className="mb-2">Comentarios de Profebot: {examn.comment}</li>
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
