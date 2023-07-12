import { useMutation } from "react-query"
import payloadClient from "../../utils/axiosPayloadInstance";
import MutationStatesUiController from "../Mutation/MutationStatesUiController";

const updateCourse = async ({ courseId }: Omit<CourseCompleteFormProps, 'userId' | 'completedBy'>) => {
    const response = await payloadClient.post(`/api/courses/${courseId}/completed-by`);
    return response.data;
}

type CourseCompleteFormProps = {
    courseId: string;
    userId: string;
    completedBy: any[] | undefined;
}

export default function CourseCompleteForm({ courseId }: CourseCompleteFormProps) {

    const mutation =  useMutation(updateCourse, {
        onSuccess: (data, variables) => {
            console.log('useMutationUpdatePaymentMethod onSuccess', data);
        }
    });

    return (
        <form className="flex flex-col " onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate({ courseId} );
        }}>
            <h2 className="text-2xl font-bold mb-4">
                Reclamar certificado
            </h2>
            <button 
                disabled={mutation.isLoading || mutation.isSuccess}
                className="btn btn-accent">
                {mutation.isLoading ? 'Enviando...' : mutation.isSuccess ? 'Enviado' : 'Enviar'}
            </button>
            <MutationStatesUiController
                errorText="Error al enviar la solicitud, Por favor intenta mas tarde."
                successText="Solicitud enviada exitosamente."
                mutation={mutation} />
        </form>
    )
}