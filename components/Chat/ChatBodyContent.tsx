import { useChat } from "ai/react";
import dayjs from "dayjs";
import { useRef, useEffect, useState } from "react";
import ChatBuble from "./ChatBuble";
import ChatInputBoard from "./ChatInputBoard";
import useMutationMessage from "./hooks/useMutationMessage";
import { Chat, Message, User } from "@/payload-types";
import useMutationUpdateMessage from "./hooks/useMutationUpdateMessage";
import { useToast } from "../ui/use-toast";
import useMutationDeleteMessage from "./hooks/useMutationDeleteMessage";
import { useAtomValue } from "jotai";
import { modelStore } from "./ChatModel/Models";
import { ChatAtom } from "@/utils/chatStore";
import themeAtom from "@/utils/store";

type ChatBodyContentProps = {
	currentChat: ChatAtom;
	user: User;
	oldMessages?: Message[];
    type: Chat["type"];
};

export const config = {
    runtime: 'edge'
}

export default function ChatBodyContent({
	currentChat,
	user,
	oldMessages,
    type,
}: ChatBodyContentProps) {

	const messageMutation = useMutationMessage();
    const messsageEditMutation = useMutationUpdateMessage();
    const messageDeleteMutation = useMutationDeleteMessage();
    const modelSettings = useAtomValue(modelStore)
    const theme = useAtomValue(themeAtom)
    const themeClass = theme === "dark" ? "dark-editor" : ""

    

    const { toast } = useToast()

    // const [editMessage, setEditMessage] = useState<boolean>(false);
	// TODO: Fix this type
	const initialMessages =
		oldMessages && oldMessages.length > 0
			? oldMessages.map((m) => ({
					role: m.type === "text" ? "user" : "assistant",
					content: m.type === "text" ? m.text! : m.ai!,
					id: m.id,
					createdAt: new Date(m.createdAt),
            })).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
			: ([] as any);

	const { messages, input, handleInputChange, handleSubmit, setMessages, isLoading, reload } =
		useChat({
			initialMessages: initialMessages,
			api: "/api/chat",
			onFinish(message) {
				messageMutation.mutate(
					{
						chat: currentChat.id,
						type: "text",
						text: input,
					},
					{
						onSuccess(data, variables, context) {
							messageMutation.mutate({
								chat: currentChat.id,
								type: "ai",
								ai: message.content,
							});
						},
					}
				);
			},
            body: {
                ...modelSettings,
                type: type,
                chatId: currentChat.id,
            },
            onError(error) {
                console.log(error, "error")
                toast({
                    title: "Oh no!",
                    description: "Hubo un error al enviar el mensaje, contacta a soporte",
                    variant: "destructive",
                })
            },
		});

    // TODO: add EditMessageForm
    // function editCallback(data: any) {
    //     const { id, content, createdAt } = data
    //     // get all of the ids after the edited message
    //     const ids = messages.map((m) => m.id)
    //     const index = ids.indexOf(id)
    //     const idsAfter = ids.slice(index + 1)
    //     const idsBefore = ids.slice(0, index)

    //     console.log(idsAfter, "idsAfter")
    //     console.log(idsBefore, "idsBefore")

    //     messageDeleteMutation.mutate({
    //         ids: idsAfter,
    //     }, {
    //         onSuccess(data, variables, context) {
    //             console.log(data, "data")
    //             messsageEditMutation.mutate({
    //                 id: id,
    //                 content: content,
    //                 createdAt: createdAt,
    //             }, {
    //                 onSuccess(data, variables, context) {
    //                     console.log(data, "data")
    //                     setMessages((oldMessages) => {
    //                         // only add the edited message and the messages before it
    //                         const newMessages = [...oldMessages.filter((m) => idsBefore.includes(m.id)), {
    //                             role: "user",
    //                             content,
    //                             id,
    //                             createdAt,
    //                         }]
    //                         return newMessages
    //                     })
    //                     reload()
    //                     toast({
    //                         title: "Mensaje editado",
    //                         description: "El mensaje se ha editado correctamente",
    //                         variant: "success",
    //                     })
    //                 },
    //                 onError(error) {
    //                     console.log(error, "error")
    //                     toast({
    //                         title: "Oh no!",
    //                         description: "Hubo un error al editar el mensaje, contacta a soporte",
    //                         variant: "destructive",
    //                     })
    //                 }
    //             })
    //         },
    //         onError(error, variables, context) {
    //             console.log(error, "error")
    //             toast({
    //                 title: "Oh no!",
    //                 description: "Hubo un error al editar el mensaje, contacta a soporte",
    //                 variant: "destructive",
    //             })
    //         },
    //     })

    // }

    const isDisabled = messsageEditMutation.isPending || messageMutation.isPending || isLoading || messageDeleteMutation.isPending
	const formRef = useRef<HTMLFormElement>(null);

    // useEffect(() => {
    //     const handleKeyDown = (e: KeyboardEvent) => {
    //         if (e.key === "Enter" && !e.shiftKey) {
    //             e.preventDefault();
    //             formRef.current?.addEventListener("submit", (e: any) => {
    //                 handleSubmit(e);
    //             });
    //             formRef.current?.dispatchEvent(
    //                 new Event("submit", { cancelable: true })
    //             );
    //         }
    //     };

    //     const textarea = formRef.current?.querySelector("textarea");
    //     if (textarea) {
    //         textarea.addEventListener("keydown", handleKeyDown);
    //     }

    //     return () => {
    //         if (textarea) {
    //             textarea.removeEventListener("keydown", handleKeyDown);
    //             // TODO: Fix this
    //             // @ts-ignore
    //             formRef.current?.removeEventListener("submit", handleSubmit);
    //         }
    //     };
    // }, [handleSubmit, formRef]);

	return (
		<>
			<ul
				id="bodyMessage"
				className="flex flex-col gap-3 p-3 overflow-y-auto h-full"
			>
				{messages.map((m) => {
                    
                    return (
                        <ChatBuble
                            key={m.id}
                            user={user}
                            isDisabled={isDisabled}
                            id={m.id}
                            type={"chat"}
                            itsFromUser={m.role === "user"}
                            time={m?.createdAt}
                            value={m.content}
                            setMessages={setMessages}
                            themeClass={themeClass}
                            // editCallback={editCallback}
                            // editMessage={editMessage}
                            // setEditMessage={setEditMessage}
                        />
                    )
                })}
			</ul>

			<form
				ref={formRef}
				onSubmit={handleSubmit}
				className="flex gap-3 items-center justify-between w-full p-3 border-t pt-6 border-gray-300 mt-auto "
			>
				<ChatInputBoard
					input={input}
                    isDisabled={isDisabled}
					handleInputChange={handleInputChange}
					handleSubmit={handleSubmit}
				/>
			</form>
		</>
	);
}
