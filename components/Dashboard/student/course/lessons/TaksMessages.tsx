"use client";

import { Button } from "@/components/ui/button";
import { ForwardRefEditor } from "@/components/ui/markdown/ForwardRefEditor";
import ViewMarkdown from "@/components/ui/markdown/ViewMarkdown";
import { useChat } from "ai/react";
import { useEffect } from "react";

export default function TaskMessages() {
	const {
		messages,
		input,
		handleInputChange,
		setInput,
		handleSubmit,
		append,
		setMessages,
	} = useChat();

	useEffect(() => {
		setMessages([
			{
				role: "system",
				id: "1",
				content: `Eres un profesore de castellano de universida muy importante y eres el mejor en castellano.
                Le dejaste de tarea a tus estudiantes que escriban la siguiente frase de manera correcta: 
                "yo nose manana si voy a komer o si no y tu si sabes yo kiero comer mucho comer comer comer".
                Ellos te van a dar su propia respuesta a esto y si lo hcane mal le das la respuestas y explicas el como llegar a ella, si lo hacen bien los felicitas.
                Si tus estudiantes responden con algo no relacionado, debes de afirmarle que tienen que responder la pregunta que se les hizo.
            `,
			},
		]);
	}, []);

	return (
		<div className="flex flex-col justify-center items-center h-screen border-t border-gray-700">
			<div className="flex-1 w-full  overflow-auto p-6 space-y-4">
				{messages.map((m, index) => (
					<div
						key={index}
						className={`flex w-full ${
							m.role === "user" ? "justify-end" : "justify-start"
						}`}
					>
						<div
							className={`rounded-lg p-4 text-sm max-w-[75%] ${
								m.role === "user"
									? "bg-gray-800 text-gray-200"
									: m.role === "assistant"
									? "bg-gray-700 text-gray-200"
									: null
							}`}
						>
							{
                                m.role === 'user' || m.role === 'assistant' ? (
                                    <ViewMarkdown markdown={m.content} />
                                ) : null
                            }
						</div>
					</div>
				))}
			</div>

			<div className="w-full  p-4  rounded-lg">
				<form
					onSubmit={handleSubmit}
					className="flex items-end gap-4 flex-col w-full"
				>
					<ForwardRefEditor
						className="w-full rounded-lg p-4  border-none focus:ring-2 focus:ring-gray-500 focus:outline-none"
						placeholder="Type your message..."
						markdown={input}
						onChange={(value) => setInput(value)}
					/>

					<Button
						className="w-full"
						variant="default"
						type="submit"
						onClick={() => {
							append({ role: "user", content: input });

							setInput("");
						}}
					>
						Send
					</Button>
				</form>
			</div>
		</div>
	);
}
