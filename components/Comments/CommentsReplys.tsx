import CommentReplyUserData, { CommentReplyUserDataProps } from "./CommentReplyUserData";
import payloadClient from "../../utils/axiosPayloadInstance";
import { useState } from "react";
import SkeletonComments from "../Skeletons/SkeletonComments";
import { PaginatedDocs } from "../../utils/types/common";
import { Comment } from "../../payload-types";
import Pagination from "../Pagination";
import { useQuery } from "@tanstack/react-query";

const getComments = async ({page, commentableId}: {page: number, commentableId: string}) => {
    const response = await payloadClient.get<PaginatedDocs<Comment>>(`/api/comments?where[commentable.value][equals]=${commentableId}&page=${page}`);
    return response.data;
}

type CommentReplysProps = {
  commentableId: string;
}

export default function CommentsReplys({ commentableId }: CommentReplysProps ) {

    const [page, setPage] = useState<number>(1);

    const query = useQuery({
      queryKey: ['comments', {page, commentableId}],
      queryFn: () => getComments({page, commentableId}),
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
                        <p>No hay comentarios</p>
                    )}
                    {query.data?.docs?.map((comment) => (
                      <SusccessComponent key={comment.id} comment={comment} page={page} setPage={setPage} query={query} />
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
            )}
        </div>
    )

}

type SusccessComponentProps = {
  comment: Comment;
  page: number;
  setPage: (page: number) => void;
  query: any;
}

function SusccessComponent({
  comment,
  page,
  setPage,
  query,
}: SusccessComponentProps) {

  const user = comment?.createdBy || { name: "Anónimo" } as any;
  console.log(user)
  const avatar = user?.photo?.url || "https://randomuser.me/api/portraits/men/54.jpg"
  console.log(avatar)
  const name = user?.firstName + " " + user?.lastName || "Anónimo"
  return (
    <>
      <CommentReply key={comment.id} commentId={comment.id} avatar={avatar} name={name} date={comment.createdAt}>
        <p>{comment.comment}</p>
      </CommentReply>
    </>
  )
}


type s = CommentReplyUserDataProps & {
    children: React.ReactNode;
    commentId: string;
}

function CommentReply({ avatar, name, date, children }: s) {
  return (
    <article className="p-6 text-base border-t ">
      <CommentReplyUserData avatar={avatar} name={name} date={date} />
      <p className="text-gray-500 dark:text-gray-400">
        {children}
      </p>
    </article>
  );
}
