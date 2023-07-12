import ReviewComments from "./ReviewComments";

type ReviewsProps = {
    reviewableId: string;
    relationTo: string;
}

export default function Reviews({ reviewableId, relationTo }: ReviewsProps) {
    return (
        <section className="mx-auto mt-16 w-full">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg lg:text-2xl font-bold text-secondary">
                    Reseñas
                </h2>
            </div>
            {/* <CommentForm commentableId={commentableId} relationTo={relationTo} /> */}
            <ReviewComments reviewableId={reviewableId}  />
        </section>
    );
}
