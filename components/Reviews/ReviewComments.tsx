import payloadClient from "../../utils/axiosPayloadInstance";
import { useState } from "react";
import SkeletonComments from "../Skeletons/SkeletonComments";
import { PaginatedDocs } from "../../utils/types/common";
import { Review, User } from "../../payload-types";
import Pagination from "../Pagination";
import dayjs from "dayjs";
import { useQuery } from "@tanstack/react-query";

const getComments = async ({page, reviewableId}: {page: number, reviewableId: string}) => {
    const response = await payloadClient.get<PaginatedDocs<Review>>(`/api/reviews?where[reviewable.value][equals]=${reviewableId}&page=${page}`);
    return response.data;
}

type ReviewReplysProps = {
    reviewableId: string;
}

export default function ReviewComments({ reviewableId }: ReviewReplysProps ) {

    const [page, setPage] = useState<number>(1);

    const query = useQuery({
        queryKey: ['reviews', {page, reviewableId}],
        queryFn: () => getComments({page, reviewableId}),
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: false,
    });

    return (
        <div className="flex flex-col space-y-4">
            {query.isLoading && (
                <SkeletonComments />
            )}
            {query.isSuccess && (
                <>
                    {query.data?.docs?.length === 0 && (
                        <p>No hay reviews</p>
                    )}
                    {
                        query.data.docs.length > 0 && (
                            <>
                                {query.data?.docs?.map((review) => (
                                    <ReviewComment
                                        key={review.id}
                                        createdAt={review.createdAt}
                                        createdBy={review.createdBy}
                                        review={review.review}
                                        rating={review.rating}
                                    />
                                ))}
                                <Pagination 
                                page={page}
                                onClick={(page) => setPage(page)}
                                totalPages={query.data?.totalPages}
                                limit={query.data?.limit}
                                pagingCounter={query.data?.pagingCounter}
                                hasNextPage={query.data?.hasNextPage}
                                hasPrevPage={query.data?.hasPrevPage}
                                nextPage={query.data?.nextPage}
                                prevPage={query.data?.prevPage} 
                                totalDocs={query.data?.totalDocs}
                                />
                            </>
                        )
                    
                    }
                </>
            )}
        </div>
    )
}

const posibleRatings = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5];

type ReviewCommentProps = Omit<Review, 'reviewable' | 'id' | 'updatedAt'>;

function ReviewComment({
    createdAt,
    createdBy,
    review,
    rating,
}: ReviewCommentProps) {

    const dateCreacted = dayjs(createdAt).format('DD/MM/YYYY');
    const userName = (createdBy as User)?.firstName + ' ' + (createdBy as User)?.lastName;

    return (
        <article>
            <div className="flex items-center mb-4 space-x-4">
                <img className="w-10 h-10 rounded-full" src="/docs/images/people/profile-picture-5.jpg" alt="" />
                <div className="space-y-1 font-medium dark:text-white">
                    <p>{userName}</p>
                </div>
            </div>
            <div className="flex items-center mb-1">
                <div className="rating rating-lg rating-half">
                    <input type="radio" name="rating-10" className="rating-hidden" />
                    {posibleRatings.map((posibleRating, index) => {
                        return (
                            <input 
                                key={posibleRating}
                                type="radio" 
                                name="rating-10" 
                                className={`bg-accent mask mask-star-2 ${posibleRating % 1 === 0 ? 'mask-half-1' : 'mask-half-2'}`} 
                                checked={`${posibleRating}`=== rating}
                            />
                        )
                    })}
                </div>
            </div>
            <footer className="mb-5 text-sm text-gray-500 dark:text-gray-400">
                <time dateTime={dateCreacted}>{dateCreacted}</time>
            </footer>
            <p className="mb-2">{review}</p>
        </article>
    )
}
