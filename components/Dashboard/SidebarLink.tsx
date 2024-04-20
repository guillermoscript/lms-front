import Link from "next/link";

const SidebarLink = ({
	icon: Icon,
	text,
	href,
	active,
}: {
	icon: React.ComponentType;
	text: string;
	href: string;
	active?: boolean;
}) => {
	return (
		<Link
			className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-all ${
				active
					? "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-50"
					: "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50"
			}`}
			href={href}
		>
			<Icon className="h-4 w-4" />
			{text}
		</Link>
	);
};

export default SidebarLink;