import { Chat } from "@/payload-types";
import { PaginatedDocs } from "@/utils/types";
import { FaceIcon } from "@radix-ui/react-icons";

import dayjs from "dayjs";
import ChatPreview from "./ChatPreview";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "../ui/command";

export default function SidebarChat({ chats }: { chats: PaginatedDocs<Chat> }) {
		
	if (chats.docs.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center h-full">
				<div className="flex items-center justify-center w-12 h-12 mb-3 rounded-full bg-primary">
					<FaceIcon className="w-6 h-6 text-white" />
				</div>
				<p className="text-sm text-gray-500">No tienes chats</p>
			</div>
		);
	}

	return (
		<Command className="rounded-lg border ">
			<CommandInput placeholder="Buscar chats" />
			<CommandList className="h-full overflow-y-auto max-h-full">
				<CommandEmpty>No se consigue.</CommandEmpty>
				<CommandGroup heading="Tus chats">
					{chats.docs.map((chat) => {
						console.log(chat)
						return (
							<CommandItem key={chat.id}>
								<ChatPreview
									chatName={chat.name}
									time={dayjs(chat.createdAt).format("HH:mm")}
									message={chat.description || "Sin mensajes"}
									chatId={chat.id}
									type={chat.type}
								/>
							</CommandItem>
						)
					})}
				</CommandGroup>
			</CommandList>
		</Command>
	);
}

