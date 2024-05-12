/**
 * v0 by Vercel.
 * @see https://v0.dev/t/aeJzZVIZhlF
 * Documentation: https://v0.dev/docs#integrating-generated-code-into-your-nextjs-app
 */
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import Sidebar from "@/components/dashboard/Sidebar";

export default function Component({ children}: { children: React.ReactNode}) {
	return (
		<div className="grid min-h-screen w-full lg:grid-cols-[280px_1fr]">
			<Sidebar />
			<div className="flex flex-col">
				<DashboardHeader />
				<main className="flex-1 flex flex-col gap-4 p-4 md:gap-8 md:p-6">
					{children}
				</main>
			</div>
		</div>
	);
}

