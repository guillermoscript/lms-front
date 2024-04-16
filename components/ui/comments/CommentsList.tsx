import { createClient } from "@/utils/supabase/server";
import { Database } from "@/utils/supabase/supabase";
import dayjs from "dayjs";
import { cookies } from "next/headers";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default async function CommentsList({
    where,
}:{
    where: {
        entity_id: number
        entity_type: Database['public']['Tables']['comments']['Row']['entity_type'],
    }
}) {
    
    const cookieStore = cookies();
	const supabase = createClient(cookieStore);

    const comments = await supabase
        .from("comments")
        .select(`*,
        profiles (*)
        `)
        .eq("entity_id", where.entity_id)
        .eq("entity_type", where.entity_type)
        .order("id", { ascending: true })
        console.log(comments)

	return (
        <div className="flex flex-col gap-4">
            {comments.data?.map((comment) => (
                <CommentContent
                    comment={comment}
                    key={comment.id}
                />
            ))}
        </div>
    )
}

function CommentContent({
    comment
}: {
    comment: Database['public']['Tables']['comments']['Row']
}  ) {
    
    return (
        <div
            className=" p-4 rounded-md shadow-md"
        >
            <Markdown
                className={' markdown-body'}
                remarkPlugins={[remarkGfm]}>
                {comment.content}
            </Markdown>
            <p className=" text-sm">
                Posted by {comment.profiles.full_name} on {dayjs(comment.updated_at || comment.created_at).format("DD/MM/YYYY")}
            </p>
        </div>
    )
}