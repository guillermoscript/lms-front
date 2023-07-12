import CommentForm, { CommentFormProps } from "./CommentForm";
import CommentsReplys from "./CommentsReplys";

export type CommentProps = Omit<CommentFormProps, "comment"> & {
    // children: React.ReactNode;
    commentableId: string;
}

export default function Comments({ commentableId, relationTo }: CommentProps) {
    return (
        <section className="mx-auto mt-16 w-full">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg lg:text-2xl font-bold text-secondary">
                    Comentarios
                </h2>
            </div>
            <CommentForm commentableId={commentableId} relationTo={relationTo} />
            <CommentsReplys commentableId={commentableId}  />
        </section>
    );
}
