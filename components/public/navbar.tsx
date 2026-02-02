import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export async function Navbar() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    return (
        <nav className="fixed top-0 z-50 w-full border-b border-white/5 bg-[#0A0A0A]/80 backdrop-blur-md">
            <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">

                {/* Logo */}
                <Link href="/" className="flex items-center space-x-2">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                        <span className="font-bold text-white">L</span>
                    </div>
                    <span className="font-bold text-lg text-white tracking-tight">
                        LMS V2
                    </span>
                </Link>

                {/* Center Links */}
                <div className="hidden md:flex items-center space-x-8">
                    <Link href="/courses" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
                        Courses
                    </Link>
                    <Link href="/pricing" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
                        Plans
                    </Link>
                    <Link href="/about" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
                        About
                    </Link>
                </div>

                {/* Right Actions */}
                <div className="flex items-center space-x-4">
                    {user ? (
                        <Link href="/dashboard/student">
                            <Button variant="default" className="bg-white text-black hover:bg-zinc-200">
                                Dashboard
                            </Button>
                        </Link>
                    ) : (
                        <>
                            <Link href="/auth/login" className="hidden sm:inline-block">
                                <Button variant="ghost" className="text-zinc-400 hover:text-white hover:bg-white/5">
                                    Login
                                </Button>
                            </Link>
                            <Link href="/auth/signup">
                                <Button className="bg-blue-600 hover:bg-blue-500 text-white border-0 font-medium">
                                    Sign Up
                                </Button>
                            </Link>
                        </>
                    )}
                </div>
            </div>
        </nav>
    );
}
