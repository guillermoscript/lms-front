import useRefreshServerProps from "@/utils/hooks/useRefreshServerProps";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { useAtom } from "jotai";
import Modal from "../ui/Modal";
import { chatAtom } from "@/utils/chatStore";
import { apiUrl } from "@/utils/env";
import payloadClient from "@/utils/axiosPayloadInstance";

type DeleteChatModalProps = {
    open: boolean;
    onOpenChange: any;
}

export default function DeleteChatModal({ open, onOpenChange }: DeleteChatModalProps) {
	const { refreshData } = useRefreshServerProps();
	const [currentChat, setCurrentCcurrentChat] = useAtom(chatAtom);
	const { mutate, isPending } = useMutation(
		{
			mutationFn: async () => {
				const res = await payloadClient.delete(
					`${apiUrl}/api/chats/${currentChat.id}`,
					{
						withCredentials: true,
					}
				);
				return res.data;
			},
			onSuccess: () => {
				onOpenChange(false);
				refreshData();
				setCurrentCcurrentChat({
					id: "",
					name: "",
				});
			}
		}
	);

	if (!currentChat.id) {
		return (
			<Modal
				open={open}
				onOpenChange={onOpenChange}
				title="Eliminar Carpeta"
			>
				<div className="flex flex-col items-center justify-center w-full">
					<p className="text-sm text-gray-500">
						Primero selecciona una carpeta, para poder eliminarla
					</p>
				</div>
			</Modal>
		);
	}

	return (
		<Modal open={open} onOpenChange={onOpenChange} title="Eliminar Carpeta">
			<div className="flex flex-col items-center justify-center w-full">
				<p className="text-sm text-gray-500">
					¿Estas seguro de eliminar esta carpeta?
				</p>
				<div className="flex items-center justify-center w-full mt-4">
					<button
						className="btn btn-sm btn-secondary"
						onClick={() => onOpenChange(false)}
					>
						Cancelar
					</button>
					<button
						className="btn btn-sm btn-danger ml-2"
						onClick={() => mutate()}
					>
						{isPending? "Eliminando..." : "Eliminar"}
					</button>
				</div>
			</div>
		</Modal>
	);
}