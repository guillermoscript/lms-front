import { useMutation, useQueryClient } from "react-query";
import payloadClient from "../../utils/axiosPayloadInstance";
import { useEffect, useState } from "react";
import MutationStatesUiController from "../Mutation/MutationStatesUiController";
import useHideAfterXSeconds from "../../utils/hooks/useHideAfterXSeconds";

export type CommentFormProps = {
    commentableId: string;
    comment: string;
    relationTo: string;
}

const postComment = async ({ comment, commentableId, relationTo }: CommentFormProps) => {
    const response = await payloadClient.post(`/api/comments/`, {
        comment,
        commentable:{
            value: commentableId,
            relationTo: relationTo
        }
    });
    return response.data;
}

export default function CommentForm({ commentableId, relationTo }: Omit<CommentFormProps, 'comment'>) {

    const {showAlert, setShowAlert} = useHideAfterXSeconds(3000)

    const [commentValue, setCommentValue] = useState<string>('');
    const mutation = useMutation(postComment, {
        onSuccess: (data) => {
            console.log('useMutationPostComment onSuccess', data);
            setCommentValue('');
            queryClient.invalidateQueries('comments');
            setShowAlert(true);
        },
        onError: (error) => {
            console.log('useMutationPostComment onError', error);
            setShowAlert(true);
        }
    });
    
    const queryClient = useQueryClient();

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!commentValue) return;
        mutation.mutate({
            comment: commentValue,
            commentableId,
            relationTo
        });
    };

    return (
        <form className="mb-10" onSubmit={handleSubmit}>
            <div className="py-2 px-4 mb-4 rounded-lg rounded-t-lg border border-primary-200">
                <textarea
                    id="comment"
                    rows={6}
                    className="px-0 w-full bg-transparent text-sm border-0 focus:ring-0 focus:outline-none "
                    placeholder="Hola, ¿qué opinas?"
                    required
                    value={commentValue}
                    onChange={(e) => setCommentValue(e.target.value)}
                />
                
            </div>
            <div className="flex justify-end">
                <button disabled={mutation.isLoading} className="btn btn-primary">Enviar comentario</button>
            </div>
            {showAlert && <MutationStatesUiController
                errorText="Error al enviar el comentario."
                successText="Comentario enviado correctamente."
                mutation={mutation} />}
        </form>
    );
}
