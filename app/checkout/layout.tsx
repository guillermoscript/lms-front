import Header from "@/components/Header";

export default function Layout({ children }: { children: React.ReactNode }) {
	return (
		<>
			<Header />
			<div className="w-full max-w-4xl mx-auto px-4 md:px-6 py-12 md:py-20">
				<div className="grid md:grid-cols-2 gap-10 md:gap-16">
					{children}
				</div>
			</div>
		</>
	);
}
