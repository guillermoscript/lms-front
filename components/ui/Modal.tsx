import * as Dialog from "@radix-ui/react-dialog";

type ModalProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
    children: React.ReactNode;
    title: React.ReactNode | string;
};

export default function Modal({
	onOpenChange,
	open,
    children,
    title
}: ModalProps) {
	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			<Dialog.Trigger />
			<Dialog.Portal>
				<Dialog.Overlay className=" bg-slate-800 opacity-70  data-[state=open]:animate-overlayShow fixed inset-0" />
				<Dialog.Content className="data-[state=open]:animate-contentShow fixed top-[50%] left-[50%] max-h-[85vh] w-[90vw] max-w-[550px] translate-x-[-50%] translate-y-[-50%] rounded-[6px] bg-white p-[25px] shadow-[hsl(206_22%_7%_/_35%)_0px_10px_38px_-10px,_hsl(206_22%_7%_/_20%)_0px_10px_20px_-15px] focus:outline-none">
					<Dialog.Close className="absolute top-4 right-4 hover:bg-neutral-100 rounded-full p-1 transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-neutral-100">
						<svg
							width="24"
							height="24"
							viewBox="0 0 24 24"
							fill="none"
							xmlns="http://www.w3.org/2000/svg"
						>
							<path
								d="M6 18L18 6M6 6L18 18"
								stroke="#718096"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							></path>
						</svg>
					</Dialog.Close>
					<Dialog.Title className="text-xl text-neutral-900 font-bold mb-4">
						{title}
					</Dialog.Title>
					<Dialog.Description className="text-sm text-neutral-600 font-normal mb-4 flex flex-col">
						{children}
					</Dialog.Description>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
