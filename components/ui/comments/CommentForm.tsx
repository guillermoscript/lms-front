// @ts-nocheck
"use client";
import React, { useState } from "react";
import { Button } from "../button";
import MDEditor from "@uiw/react-md-editor";
import { useFormStatus } from "react-dom";
import { writeComment } from "@/actions/actions";

type CommentsProps = {
    entityId: number;
    entityType: string;
};

const CommentForm = ({ entityId, entityType }: CommentsProps) => {
	const [comment, setComment] = useState("");
	const [error, setError] = useState(null);
	return (
		<form
			className="p-4 rounded flex flex-col gap-4 "
			action={async (formData) => {
				if (!comment) {
					return setError("Comment cannot be empty");
				}
				formData.append("entity_id", entityId.toString());
				formData.append("entity_type", entityType);
				formData.append("content", comment)
				formData.append('content_type', 'markdown')
				
				const data = await writeComment(formData);
				console.log(data);
			}}
		>
			<MDEditor value={comment} onChange={setComment} />
			<Button2 />

			{error && <p>{error}</p>}
		</form>
	);
};

function Button2() {
	const { pending } = useFormStatus();

	return (
		<Button disabled={pending} className="disabled:opacity-50">
			Submit
		</Button>
	);
}

export default CommentForm;
