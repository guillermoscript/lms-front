import { Message as aiMessage } from "ai/react";
import { User, Message } from "@/payload-types";
import dayjs from "dayjs";
import ViewMarkdown from "../ui/makrdown/ViewMarkdown";
// import { SimpleMarkdownEditor } from "@/components/ui/makrdown/MarkdownEditor";

type ChatGeneral = {
	itsFromUser: boolean;
	user: User;
	time?: Date;
	// TODO: fix this
	value: any;
	isDisabled?: boolean;
	id: string;
	// editCallback: any
};

type ChatBubleTypes = ChatGeneral & {
	// type: Message["type"];
	// TODO: fix this
	type: any;
	themeClass: string;
	setMessages?: (messages: aiMessage[]) => void;
};

type ChatTextMessageBubleProps = ChatGeneral & {
	children: React.ReactNode;
	setMessages?: (messages: aiMessage[]) => void;
};

function ChatTextMessageBuble({
	itsFromUser,
	user,
	setMessages,
	value,
	isDisabled,
	time,
	children,
}: // editMessage,
// editCallback,
// setEditMessage
ChatTextMessageBubleProps) {
	return (
		<>
			<div
				className={`flex flex-col gap-3 bg-base-200 border-b border-base-200 p-6`}
			>
				{/* <div className="chat-image avatar">
					<div className="w-10 rounded-full">
						<img src="/images/stock/photo-1534528741775-53994a69daeb.jpg" /> 
					</div>
				</div> */}
				<div className="flex items-center gap-4 justify-between">
					<div className="flex items-center gap-1">
						<p className="text-sm text-gray-500">
							{user.firstName + " " + user.lastName}
						</p>
						<time className="text-xs opacity-50 mx-1">
							{dayjs(time).format("HH:mm")}
						</time>
					</div>
					{/* <button
						className="btn btn-gray btn-sm"
						onClick={() => {
							setEditMessage(true);
						}}
					>
						<Pencil1Icon className="w-5 h-5 text-gray-500" />
						Editar
					</button> */}
				</div>
				<div className=" flex flex-col gap-1">
					{/* {editMessage ? (
						<>
							<FormEditMessage
								message={{
									id: value.id,
									createdAt: time,
								}}
								editCallback={editCallback}
								setMessages={setMessages}
								isDisabled={isDisabled}
								setEditMessage={setEditMessage}
								value={value}
							/>
							<button
								className="btn btn-error"
								onClick={() => {
									setEditMessage(false);
								}}
							>
								Cancelar
							</button>
						</>
					) : (
						children
					)} */}
					{children}
				</div>
			</div>
		</>
	);
}

export default function ChatBuble({
	itsFromUser,
	user,
	time,
	value,
	id,
	setMessages,
	type,
	isDisabled,
	themeClass,
}: // editMessage,
// editCallback,
// setEditMessage
ChatBubleTypes) {
	if (type === "chat") {
		if (itsFromUser) {
			return (
				<div
					className={`flex flex-col gap-3 bg-base-200 border-b border-base-200 p-6`}
				>
					<div className="flex items-center gap-4 justify-between">
						<div className="flex items-center gap-1">
							<p className="text-sm text-gray-500">
								{user.firstName + " " + user.lastName}
							</p>
							<time className="text-xs opacity-50 mx-1">
								{dayjs(time).format("HH:mm")}
							</time>
						</div>
					</div>
					<div className=" flex flex-col gap-1">{value!}</div>
				</div>
			);
		} else {
			return (
				<div
					className={`flex flex-col gap-3 bg-base-300 border-b border-base-200 p-6`}
				>
					<div className="flex items-center gap-1">
						<p className="text-sm text-gray-500">Chat Bot</p>
						<time className="text-xs opacity-50 mx-1">
							{dayjs(time).format("HH:mm")}
						</time>
					</div>
					{isDisabled ? (
						<p>{value!}</p>
					) : (
						 <ViewMarkdown value={value!} />
						// <SimpleMarkdownEditor
						// 	markdown={value!}
						// 	className={` prose max-w-none`}
						// />
					)}
				</div>
			);
		}
	}

	return null;
}
