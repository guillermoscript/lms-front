import { Sidebar } from "@/components/dashboard/Sidebar";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";

export default function Layout({ children }: { children: React.ReactNode }) {
	return (
		<div className="min-h-full flex gap-4 w-full  overflow-hidden justify-between ">
			<Sidebar>
				<ul className="flex flex-col gap-2 items-start">
					<li className="flex items-center gap-2">
						<Link
							href="/dashboard/account/orders"
							className={buttonVariants({ variant: 'link' })}
						>
							Ordenes
						</Link>
					</li>
				</ul>
			</Sidebar>
			<div className="flex-1 p-8 overflow-y-auto">{children}</div>
		</div>
	);
}
