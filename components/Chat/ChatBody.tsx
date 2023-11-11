import { apiUrl } from "@/utils/env";
import { FaceIcon } from "@radix-ui/react-icons";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useAtom, useAtomValue } from "jotai";

import {  User } from "@/payload-types";
import {  chatAtom } from "@/utils/chatStore";

import { Skeleton } from "../ui/skeleton";

import ChatSetBodyPrompt from "./ChatBodyPrompt";
import ChatBodyContent from "./ChatBodyContent";
import payloadClient from "@/utils/axiosPayloadInstance";

type ChatBodyProps = {
	user: User;
};

export default function ChatBody({ user }: ChatBodyProps) {
	const currentChat = useAtomValue(chatAtom);
	console.log(currentChat)

	const userMessagesQuery = useQuery({
		queryKey: ["user-mesages", currentChat.id],
		queryFn: async () => {
			const res = await payloadClient.get(
				`${apiUrl}/api/user-messages/chat/${currentChat.id}/messages`,
				{
					withCredentials: true,
					params: {
						sort: "-createdAt",
					},
				}
			);
			return res.data;
		},
		refetchOnMount: false,
		enabled: currentChat.id !== "",
	});

	return (
		<div className="relative w-full overflow-y-auto h-[40rem] flex flex-col">
			{currentChat.id === "" ? (
				<div className="flex flex-col items-center justify-center h-full">
					<div className="flex items-center justify-center w-12 h-12 mb-3 rounded-full bg-primary">
						<FaceIcon className="w-6 h-6 text-white" />
					</div>
					<p className="text-sm text-gray-500">Selecciona un chat</p>
				</div>
			) : userMessagesQuery.isLoading ? (
				<div className="flex flex-col items-center justify-center h-full">
					<span className="loading loading-spinner loading-lg"></span>
				</div>
			) : userMessagesQuery.isError ? (
				<div className="flex flex-col items-center justify-center h-full">
					<div className="flex items-center justify-center w-12 h-12 mb-3 rounded-full bg-primary">
						<FaceIcon className="w-6 h-6 text-white" />
					</div>
					<p className="text-sm text-gray-500">Ocurrio un error</p>
				</div>
			) : (
				userMessagesQuery.isSuccess &&
				(userMessagesQuery.data.docs.length === 0 ? (
					<ChatSetBodyPrompt currentChat={currentChat} user={user} />
				) : (
					<ChatBodyContent
						type={currentChat.type}
						user={user}
						currentChat={currentChat}
						oldMessages={userMessagesQuery.data.docs}
					/>
				))
				// userMessagesQuery.isSuccess && currentChat.type === 'bot' ?
				// (userMessagesQuery.data.docs.length === 0 ? (
				// 	<ChatSetBodyPrompt currentChat={currentChat} user={user} />
				// ) : (
				// 	<ChatBodyContent
				// 		user={user}
				// 		type={currentChat.type}
				// 		currentChat={currentChat}
				// 		oldMessages={userMessagesQuery.data.docs}
				// 	/>
				// )) : currentChat.type === 'qa' && (
				// 	<ChatBodyContent
				// 		user={user}
				// 		type={currentChat.type}
				// 		currentChat={currentChat}
				// 		oldMessages={userMessagesQuery.data.docs}
				// 	/>
				// )
			)}
		</div>
	);
}
