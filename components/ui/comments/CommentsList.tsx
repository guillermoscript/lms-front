import { createClient } from "@/utils/supabase/server";
import { Database } from "@/utils/supabase/supabase";
import dayjs from "dayjs";
import { cookies } from "next/headers";
import Comment from "@/components/ui/comments/Comment";

export default async function CommentsList({
	where,
}: {
	where: {
		entity_id: number;
		entity_type: Database["public"]["Tables"]["comments"]["Row"]["entity_type"];
	};
}) {
	const cookieStore = cookies();
	const supabase = createClient(cookieStore);

	const comments = await supabase
		.from("comments")
		.select(
			`*,
        profiles (*)
        `
		)
		.eq("entity_id", where.entity_id)
		.eq("entity_type", where.entity_type)
		.order("created_at", { ascending: false });
	console.log(comments);

	return (
		<div className="flex flex-col gap-4">
			{comments.data?.map((comment) => {
				console.log(comment)
				return (
					<Comment
						key={comment.id}
						username={comment.profiles?.full_name}
						timeAgo={dayjs(comment.created_at).format(
							"MMM D, YYYY: h:mm A"
						)}
						commentText={comment.content}
					/>
				)
			})}
		</div>
	);
}

