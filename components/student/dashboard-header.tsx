"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    IconLogout,
    IconSettings,
    IconUser,
    IconBell,
    IconSearch
} from "@tabler/icons-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface DashboardHeaderProps {
    user: any;
}

export function DashboardHeader({ user }: DashboardHeaderProps) {
    const supabase = createClient();
    const router = useRouter();

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push("/auth/login");
        router.refresh();
    };

    const userInitial = user?.email?.[0].toUpperCase() || "U";

    return (
        <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-xl transition-all duration-300">
            <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-8">
                <div className="flex items-center gap-8">
                    <div className="relative group cursor-pointer hidden md:block">
                        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors">
                            <IconSearch size={18} />
                        </div>
                        <input
                            type="text"
                            className="bg-muted/50 border-transparent focus:bg-background focus:border-primary/20 rounded-xl py-2 pl-10 pr-4 text-sm w-64 transition-all duration-300 outline-none"
                            placeholder="Find your next challenge..."
                        />
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" className="rounded-full relative hover:bg-primary/5 transition-colors">
                        <IconBell size={20} className="text-muted-foreground" />
                        <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary border-2 border-background" />
                    </Button>

                    <DropdownMenu>
                        <DropdownMenuTrigger
                            render={
                                <Button variant="ghost" className="relative h-10 w-10 rounded-full p-0 overflow-hidden border-2 border-transparent hover:border-primary/20 transition-all shadow-sm">
                                    <Avatar className="h-full w-full">
                                        <AvatarImage src={user?.user_metadata?.avatar_url} alt={user?.email} />
                                        <AvatarFallback className="bg-primary/10 text-primary font-bold">
                                            {userInitial}
                                        </AvatarFallback>
                                    </Avatar>
                                </Button>
                            }
                        />
                        <DropdownMenuContent className="w-56 mt-2 rounded-2xl shadow-2xl border-muted-foreground/10" align="end">
                            <DropdownMenuGroup>
                                <DropdownMenuLabel className="font-normal">
                                    <div className="flex flex-col space-y-1 p-2">
                                        <p className="text-sm font-black leading-none">{user?.user_metadata?.full_name || 'Student'}</p>
                                        <p className="text-xs leading-none text-muted-foreground">
                                            {user?.email}
                                        </p>
                                    </div>
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="rounded-xl m-1 cursor-pointer gap-2 focus:bg-primary/5" render={<Link href="/dashboard/student/profile" />}>
                                    <IconUser size={16} />
                                    <span>Profile</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem className="rounded-xl m-1 cursor-pointer gap-2 focus:bg-primary/5">
                                    <IconSettings size={16} />
                                    <span>Settings</span>
                                </DropdownMenuItem>
                            </DropdownMenuGroup>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                className="rounded-xl m-1 cursor-pointer gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive font-bold transition-colors"
                                onClick={handleLogout}
                            >
                                <IconLogout size={16} />
                                <span>Logout</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </header>
    );
}
