import { Message } from "ai/react";
import { useState } from "react";

export default function FormEditMessage({
	message,
	setMessages,
	setEditMessage,
	value,
	editCallback,
	isDisabled,
}: {
	isDisabled: boolean;
	message: {
		id: string;
		createdAt: Date;
	};
	setMessages?: (messages: Message[]) => void;
	setEditMessage: (value: boolean) => void;
	value: string;
	editCallback: (message: {
		role: "user" | "assistant";
		id: string;
		content: string;
		createdAt: Date;
	}) => void;
}) {
	const [messageToEdit, setMessageToEdit] = useState<string>(value);

	return (
		<form
			className="flex gap-3 items-center justify-between w-full p-3 border-t pt-6 border-gray-300 mt-auto "
			onSubmit={(e) => {
				e.preventDefault();
				setEditMessage(false);
				editCallback({
					role: "user",
					id: message.id,
					content: messageToEdit,
					createdAt: message.createdAt,
				});
			}}
		>
			<textarea
				placeholder="Mensaje"
				className="textarea resize-none h-[60px] textarea-bordered block w-full py-2 pl-4 mx-3 bg-gray-100 rounded-full outline-none focus:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
				name="message"
				cols={10}
				rows={14}
				disabled={isDisabled}
				defaultValue={messageToEdit}
				onChange={(e) => setMessageToEdit(e.target.value)}
			/>
			<button
				className="btn btn-primary disabled:btn-disabled"
				type="submit"
				disabled={isDisabled}
			>
				Enviar
			</button>
		</form>
	);
}
