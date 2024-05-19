
export default function Layout({ children }: { children: React.ReactNode }) {
	return (
		<>
			<div className="flex flex-1 max-w-7xl mx-auto ">{children}</div>
		</>
	);
}
