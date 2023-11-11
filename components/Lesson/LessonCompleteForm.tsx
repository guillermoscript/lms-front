import { useState } from "react";
import payloadClient from "../../utils/axiosPayloadInstance";
import { User } from "../../payload-types";
import MutationStatesUiController from "../Mutation/MutationStatesUiController";
import useHideAfterXSeconds from "../../utils/hooks/useHideAfterXSeconds";
import { useMutation } from "@tanstack/react-query";

type LessonCompleteFormProps = {
    user: User;
    lessonId: string;
    completedBy: any[];
};

const putMutationCompletedBy = async ({ lessonId }: Omit<LessonCompleteFormProps, 'user' | 'completedBy'>) => {
    const response = await payloadClient.post(`/api/lessons/${lessonId}/completed-by`);
    return response.data;
}

export default function LessonCompleteForm({user, lessonId, completedBy}: LessonCompleteFormProps) {

    const [completed, setCompleted] = useState<boolean>(false);
    const {showAlert, setShowAlert} = useHideAfterXSeconds(3000)

    const mutation = useMutation({
        mutationFn: putMutationCompletedBy,
        onSuccess: (data, variables) => {
            console.log('useMutationUpdatePaymentMethod onSuccess', data);
            setShowAlert(true);
        },
        onError: (error, variables) => {
            console.log('useMutationUpdatePaymentMethod onError', error);
            setShowAlert(true);
        }
    });

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!completed) return;

        mutation.mutate({
            lessonId
        });
    };

    return (
        <form className="flex flex-col form py-6" onSubmit={handleSubmit}>
            <div className="flex mb-6 gap-4">
                <label className="label-text" htmlFor="completedBy">
                    Marca como completado
                </label>
                <div className="form-control">
                    <input type="checkbox" className="checkbox checkbox-primary" checked={completed} onChange={(e) => setCompleted(e.target.checked)} />
                </div>
            </div>
            <button
                className="btn btn-primary btn-block my-4 mx-auto"
                disabled={mutation.isLoading || mutation.isSuccess}
                type="submit"
            >
                {mutation.isSuccess ? 'Completado' : mutation.isLoading ? 'Guardando...' : 'Guardar'}
            </button>
            {showAlert && 
                <MutationStatesUiController
                    errorText="Error al completar la lección, Por favor intenta de nuevo."
                    successText="Lección completada exitosamente."
                    mutation={mutation} />}
        </form>
    );
}
