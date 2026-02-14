import { Navbar } from "@/components/public/navbar";
import { Footer } from "@/components/public/footer";

export default function PublicLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-h-screen flex-col bg-black text-white selection:bg-blue-500/30">
            <Navbar />
            <main className="flex-1">
                {children}
            </main>
            <Footer />
        </div>
    );
}
