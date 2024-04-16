
"use client";
import React, { useEffect, useState } from "react";
import { Button } from "../button";

import { writeComment } from "@/actions/actions";
import { useFormState, useFormStatus } from "react-dom";
import { yupResolver } from "@hookform/resolvers/yup";
import { useForm } from "react-hook-form";
import * as yup from "yup";
import { ForwardRefEditor } from "../markdown/ForwardRefEditor";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "../card";


type CommentsProps = {
    entityId: number;
    entityType: string;
	urlToRefresh: string;
};


const CommentForm = ({ entityId, entityType, urlToRefresh }: CommentsProps) => {
	const [state, action] = useFormState(writeComment, {
		status: "idle",
		message: "",
		error: null,
	});
	const { pending } = useFormStatus();
	const [comment, setComment] = useState("");
	const form = useForm({
		defaultValues: {
			comment: "",
		},
	});
	
	useEffect(() => {
		if (state.status === "success") {
			setComment("");
		}
	}
	, [state.status]);

	return (
		<form className="w-full p-3 flex flex-col gap-4" action={action}>
			<Card>
				<CardContent>
					<ForwardRefEditor
						markdown={comment}
						className="markdown-body"
						onChange={(value) => setComment(value)}
					/>
				</CardContent>
			</Card>

			<input type="hidden" name="entity_id" value={entityId} />
			<input type="hidden" name="entity_type" value={entityType} />
			<input type="hidden" name="content" value={comment} />
			<input type="hidden" name="content_type" value="markdown" />
			<input type="hidden" name="refresh_url" value={urlToRefresh} />

			<Button
				type="submit"
				className="disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed w-full"
				disabled={form.formState.isSubmitting || pending}
			>
				{form.formState.isSubmitting || pending
					? "Submitting..."
					: "Submit"}
			</Button>

			{state.error && <div className="text-red-600">{state.error}</div>}
		</form>
	);
};

export default CommentForm;
