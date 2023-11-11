import { User } from "@/payload-types";
import { ChatAtom } from "@/utils/chatStore";
import { useQueryClient } from "@tanstack/react-query";
import { Message } from "ai";
import { useChat } from "ai/react";
import dayjs from "dayjs";
import { useState, useRef, useEffect } from "react";
import ChatBuble from "./ChatBuble";
import useMutationMessage from "./hooks/useMutationMessage";
import { useAtomValue } from "jotai";
import { modelStore } from "./ChatModel/Models";
import themeAtom from "@/utils/store";

type ChatSetBodyPromptProps = {
	currentChat: ChatAtom;
	user: User;
};

export const config = {
	runtime: 'edge'
}

export default function ChatSetBodyPrompt({
	currentChat,
	user,
}: ChatSetBodyPromptProps) {
	const [prompt, setPrompt] = useState<string>("");
	const messageMutation = useMutationMessage();
	const queryClient = useQueryClient();
	const [error, setError] = useState<string>("");
	const theme = useAtomValue(themeAtom)
    const themeClass = theme === "dark" ? "dark-editor" : ""
    const modelSettings = useAtomValue(modelStore)

	const {
		messages,
		setMessages,
		input,
		handleInputChange,
		handleSubmit,
	} = useChat({
		api: "/api/chat",
		onFinish(message) {
			console.log(message, "message en on finish");
			messageMutation.mutate(
				{
					chat: currentChat.id,
					type: "ai",
					ai: message.content,
				},
				{
					onSuccess() {
						queryClient.invalidateQueries([
							"user-mesages",
							currentChat.id,
						]);
					},
				}
			);
		},
		body: {
			...modelSettings,
		}
	});
	const formRef = useRef<HTMLFormElement>(null);

	function onSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		if (prompt === "") {
			setError("El prompt no puede estar vacio");
			return;
		}
		if (input === "") {
			setError("El input no puede estar vacio");
			return;
		}
		setError("");
		messageMutation.mutate(
			{
				chat: currentChat.id,
				type: "ai",
				ai: prompt,
			},
			{
				onSuccess(dataAi, variables, context) {
					messageMutation.mutate(
						{
							chat: currentChat.id,
							type: "text",
							text: input,
						},
						{
							onSuccess(dataUser, variables, context) {
								setMessages([
									{
										role: "system",
										content: prompt,
										id: dataAi.id,
										// make createdAt a date before the user message
										createdAt: new Date(
											new Date().getTime() - 100000
										),
									}
								]);
								handleSubmit(e);
							},
						}
					);
				},
			}
		);
	}

	return (
		<>
			<form
				id="bodyMessage"
				ref={formRef}
				onSubmit={onSubmit}
				className="flex flex-col gap-3 w-full p-3 pt-6"
			>
				<label
					htmlFor="prompt"
					className="text-zinc-500 inline  w-auto font-semibold  text-sm  pb-0.5"
				>
					Prompt: Esto es para que el bot tenga una idea de que
					responder, dandole la posibilidad de que sea mas preciso.
				</label>
				<div className="relative  min-h-[164px] flex-initial flex flex-col w-full">
					<textarea
						className="w-full textarea-bordered min-h-[164px] placeholder-zinc-400 h-full border-none focus:ring-0 focus:border-black py-2 px-0 rounded-lg"
						placeholder='"Eres un asistente virtual, tu trabajo es responder las dudas de manera correcta y precisa y tus respuestas las daras en Markdown para que se vean bonitas, titulos, listas, negritas, citas y demas de contenido dispoinble para una mejor lectura."'
						id="prompt"
						onChange={(e) => setPrompt(e.target.value)}
						value={prompt}
					></textarea>
				</div>
				<div className="relative  min-h-[164px] flex-initial flex flex-col w-full">
					<label
						htmlFor="userInput"
						className="text-zinc-500 inline  w-auto font-semibold  text-sm  pb-0.5"
					>
						Pon el mensaje que quieres que el bot responda.
					</label>
					<textarea
						className="w-full min-h-[164px] placeholder-zinc-400 h-full border-none focus:ring-0 focus:border-black py-2 px-0 rounded-lg"
						placeholder="Quiero que me expliques todo lo que sabes de los eclipses ."
						id="userInput"
						onChange={handleInputChange}
						value={input}
					></textarea>
				</div>

				{error && <p className=" text-error text-sm">{error}</p>}

				<div className="flex gap-3 items-center justify-between w-full p-3 border-t pt-6 border-gray-300 mt-auto ">
					<button type="submit" className="btn btn-primary">
						Enviar
					</button>
				</div>
				{messages.map((m, index) => (
					<ChatBuble
						key={m.id}
						id={m.id}
						user={user}
						type={"chat"}
						itsFromUser={m.role === "user"}
						time={new Date(m.createdAt!)}
						value={m.content}
						themeClass={themeClass}
					/>
				))}
			</form>
		</>
	);
}
