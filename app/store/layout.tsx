import AuthButton from "@/components/AuthButton";
import Header from "@/components/Header";
import StoreFooter from "@/components/store/StoreFooter";

export default function Layout({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex flex-col w-full h-full min-h-full px-6 py-4">
			<Header>
			</Header>
			<div className="flex flex-1 max-w-7xl mx-auto ">{children}</div>
			
			<StoreFooter />
		</div>
	);
}
