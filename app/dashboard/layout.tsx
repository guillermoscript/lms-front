import Header from "@/components/Header";
import Link from "next/link";

export default function Layout({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex w-full h-full min-h-full px-6 py-4">
			<div className="flex flex-col flex-1 w-full">
				<Header>
					<Link
						className="flex items-center text-lg font-medium transition-colors hover:text-foreground/80 sm:text-sm text-foreground/60"
						href="/dashboard/account"
					>
						Account
					</Link>
				</Header>
				<div className="flex flex-1 ">{children}</div>
			</div>
		</div>
	);
}
