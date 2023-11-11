import { Chat } from "@/payload-types";
import { chatAtom } from "@/utils/chatStore";
import { useAtom } from "jotai";

type ChatPreviewProps = {
	chatName: string;
	time: string;
	message: string;
	chatId: string;
	type: Chat["type"];
};

export default function ChatPreview({ chatName, time, message, chatId, type }: ChatPreviewProps) {

	const [currentChat, setCurrentChat] = useAtom(chatAtom)

	return (
		<button 
			onClick={() => setCurrentChat({ id: chatId, name: chatName, type: type })}
			className={`
				flex items-center px-3 py-2 text-sm transition duration-150 ease-in-out border-b border-gray-300 cursor-pointer hover:bg-gray-100 focus:outline-none w-full
				${currentChat.id === chatId ? 'bg-gray-100' : ''}
			`}>
			<div className="w-full pb-2">
				<div className="flex justify-between">
					<span className="block ml-2 font-semibold text-gray-600">
						{chatName}
					</span>
					<span className="block ml-2 text-sm text-gray-600">
						{time}
					</span>
				</div>
				<span className="block ml-2 text-sm text-gray-600">
					{message}
				</span>
			</div>
		</button>
	);
}
