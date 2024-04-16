import AuthButton from "@/components/AuthButton";
import Header from "@/components/Header";

export default function Layout({ children }: { children: React.ReactNode }) {
    
	return (
        <div className="flex flex-col flex-1 w-full">
            <Header>
            </Header>
            <div className="flex-1 p-8 overflow-y-auto">{children}</div>
        </div>
	);
}
