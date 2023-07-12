import { RichText } from "../RichText";
import SkeletonComments from "../Skeletons/SkeletonComments";
import useQueryExamnSubmission from "./hooks/useQueryExamnSubmission";

type ExamnScoreProps = {
    createdBy: string;
    evaluation: string;
}

export default function ExamnScore({ createdBy, evaluation }: ExamnScoreProps) {

    const query = useQueryExamnSubmission({ createdBy, evaluation });

    console.log(query.isSuccess ? query.data : null)
    return (
        <div className="flex flex-col mb-4">
            <h4 className="text-xl font-bold mb-6">Examen</h4>
            <div className="flex flex-row flex-wrap">
                {
                    query.isLoading? (
                        <SkeletonComments />
                    ) : null
                }
                {
                    query.isSuccess? (
                        query.data?.docs[0] ? (
                            <ExamnReviewContent
                                score={query.data?.docs[0]?.score || 'pendiente'}
                                teacherComments={query.data?.docs[0].teacherComments}
                            />
                        ) : (
                            <div className="flex flex-col">
                                <h1 className="text-2xl font-bold"> Tu examen aun no ha sido revisado</h1>
                            </div>
                        )
                    ) : null
                }
            </div>
        </div>
    );
}

type ExamnReviewContentProps =  { 
    score: number | 'pendiente'
    teacherComments: any 
}

function ExamnReviewContent({ score, teacherComments }: ExamnReviewContentProps) {

    return (
        <div className="flex flex-col">
            <h2 className="text-2xl font-bold mb-4">Calificación: {score}</h2>
            <h3 className="text-xl font-bold mb-4">Comentarios del profesor</h3>
            <RichText content={teacherComments} />
        </div>
    )
}