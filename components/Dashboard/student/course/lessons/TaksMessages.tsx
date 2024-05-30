"use client";

import { Button } from "@/components/ui/button";
import { ForwardRefEditor } from "@/components/ui/markdown/ForwardRefEditor";
import ViewMarkdown from "@/components/ui/markdown/ViewMarkdown";
import { cn } from "@/utils";
import { useChat } from "ai/react";
import { Copy, Pen } from "lucide-react";
import { useEffect } from "react";

const Message = ({
	message,
	sender,
	time,
	isUser,
}: {
	message: string;
	sender: string;
	time: string;
	isUser: boolean;
}) => {

	if (sender !== 'user' && sender !== 'assistant') {
		return null;
	}

	return (
		<div
			className={cn(
				"flex w-full border-b p-1 mb-4",
				isUser ? "justify-end " : "justify-start"
			)}
		>
			<div className="flex items-end w-full">
				{!isUser && (
					<img
						src={isUser ? "/asdasd/adad.png" : "/img/favicon.png"}
						alt="profile"
						className="max-w-[28px] object-cover rounded-full mr-4"
					/>
				)}

				<div className="flex flex-col w-full px-4 py-2 rounded-lg relative">
					<div className="font-bold mb-1 capitalize">
						{sender}{" "}
						<span className="text-xs text-gray-400 ml-2">
							{time}
						</span>
					</div>

					<ViewMarkdown markdown={message} />

					{isUser && (
						<div className="flex mt-2 space-x-2 ">
							<Pen className="cursor-pointer" />

							<Copy className="cursor-pointer" />
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

const ChatWindow = ({ messages }: { messages: any[] }) => {
	return (
		<div className="flex-1 overflow-y-auto p-4 ">
			{messages.map((msg, index) => (
				<Message
					key={index}
					message={msg.content}
					sender={msg.role}
					time={msg.time}
					isUser={msg.role === "user"}
				/>
			))}
		</div>
	);
};

const ChatInput = ({
	handleSubmit,
	handleInputChange,
	input,
}: {
	handleSubmit: (e: any) => void;
	input: string;
	handleInputChange: (e: any) => void;
}) => {
	return (
		<form onSubmit={handleSubmit} className="p-4 flex ">
			{/* <ForwardRefEditor
				className="flex-1 p-2 rounded-l-lg"
				placeholder="Send a message"
				markdown={message}
				onChange={(value) => setMessage(value)}
				onKeyDown={(e) => e.key === "Enter" && handleSend()}
			/> */}
			<input
				type="text"
				className="flex-1 p-2 border rounded-l-lg"
				placeholder="Send a message"
				onChange={handleInputChange}
				value={input}
			/>
			<Button>Send</Button>
		</form>
	);
};

export default function TaskMessages({
	systemPrompt,
}: {
	systemPrompt: string;
}) {
	const { messages, input, handleInputChange, handleSubmit, setMessages } =
		useChat();
	useChat();

	useEffect(() => {
		setMessages([
			{
				role: "system",
				id: "1",
				content: systemPrompt,
			},
		]);
	}, []);

	return (
		<div className="min-h-screen flex flex-col">
			<ChatWindow messages={messages} />
			<ChatInput
				handleSubmit={handleSubmit}
				input={input}
				handleInputChange={handleInputChange}
			/>
		</div>
	);
}
