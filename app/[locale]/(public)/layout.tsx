import { Navbar } from "@/components/public/navbar";
import { Footer } from "@/components/public/footer";
import { PoweredByBanner } from "@/components/public/powered-by-banner";
import { hasPuckPage } from "@/lib/public/has-puck-page";

export default async function PublicLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const isPuckPage = await hasPuckPage()

    // When a Puck page is active, it has its own header/footer — skip the shell
    if (isPuckPage) {
        return (
            <div className="flex min-h-screen flex-col">
                <main className="flex-1">
                    {children}
                </main>
            </div>
        )
    }

    return (
        <div className="flex min-h-screen flex-col bg-background text-foreground selection:bg-primary/30">
            <Navbar />
            <main className="flex-1">
                {children}
            </main>
            <PoweredByBanner />
            <Footer />
        </div>
    );
}
