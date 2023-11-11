import { Chat } from "@/payload-types";
import { PaginatedDocs } from "@/utils/types/common";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuItem,
} from "@radix-ui/react-dropdown-menu";
import { HamburgerMenuIcon, Cross1Icon } from "@radix-ui/react-icons";

type ChatMenuProps = {
	chats: PaginatedDocs<Chat>;
	setOpen: React.Dispatch<React.SetStateAction<boolean>>;
	setOpenDeleteModal: React.Dispatch<React.SetStateAction<boolean>>;
	hideSidebar: boolean;
	setHideSidebar: React.Dispatch<React.SetStateAction<boolean>>;
};

export default function ChatMenu({
	chats,
	setOpen,
	setOpenDeleteModal,
	setHideSidebar,
	hideSidebar,
}: ChatMenuProps) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger className="cursor-pointer" asChild>
				<HamburgerMenuIcon />
			</DropdownMenuTrigger>
			<DropdownMenuContent className=" w-80 z-10 bg-base-300 rounded-lg p-8  border-2 border-gray-300 ">
				<DropdownMenuLabel className="text-sm text-gray-500 mb-5">
					Acciones
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<div className="flex flex-col gap-4 bor">
					{chats.docs.length > 0 && (
						<>
							<DropdownMenuItem
								onClick={() => setOpenDeleteModal(true)}
								className="flex gap-3 item-center w-full btn btn-sm btn-ghost "
							>
								<Cross1Icon className="w-6 h-6 text-gray-500 cursor-pointer" />
								<p className="text-sm text-gray-500">
									Eliminar chat
								</p>
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => setHideSidebar(!hideSidebar)}
								className="flex gap-3 item-center w-full cursor-pointer btn btn-sm btn-ghost"
							>
								<p className="text-sm text-gray-500">
									{hideSidebar
										? "Mostrar barra lateral"
										: "Ocultar barra lateral"}
								</p>
							</DropdownMenuItem>
						</>
					)}
					<DropdownMenuItem
						className="btn btn-sm btn-secondary w-full"
						onClick={() => setOpen(true)}
					>
						Crear nuevo chat
					</DropdownMenuItem>
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
