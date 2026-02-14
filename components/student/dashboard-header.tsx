"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ModeToggle } from "@/components/mode-toggle";
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
import { useTranslations } from "next-intl";

interface DashboardHeaderProps {
    user: any;
}

export function DashboardHeader({ user }: DashboardHeaderProps) {
    const t = useTranslations('components.dashboardHeader');
    const supabase = createClient();
    const router = useRouter();

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push("/auth/login");
        router.refresh();
    };

    const userInitial = user?.email?.[0].toUpperCase() || "U";

    return (
        <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-xl transition-all duration-300">
            <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-8">
                <div className="flex items-center gap-8">
                    <div className="relative group cursor-pointer hidden md:block">
                        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-muted-foreground group-focus-within:text-cyan-400 transition-colors">
                            <IconSearch size={18} />
                        </div>
                        <input
                            type="text"
                            className="bg-muted border border-input focus:bg-muted focus:border-cyan-500/50 text-foreground placeholder:text-muted-foreground rounded-xl py-2 pl-10 pr-4 text-sm w-64 transition-all duration-300 outline-none"
                            placeholder={t('searchPlaceholder')}
                        />
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <ModeToggle />
                    <Button variant="ghost" size="icon" className="rounded-full relative hover:bg-accent transition-colors">
                        <IconBell size={20} className="text-muted-foreground" />
                        <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-cyan-500 border-2 border-background" />
                    </Button>

                    <DropdownMenu>
                        <DropdownMenuTrigger
                            render={
                                <Button variant="ghost" className="relative h-10 w-10 rounded-full p-0 overflow-hidden border-2 border-transparent hover:border-cyan-500/50 transition-all shadow-sm">
                                    <Avatar className="h-full w-full">
                                        <AvatarImage src={user?.user_metadata?.avatar_url} alt={user?.email} />
                                        <AvatarFallback className="bg-cyan-500/20 text-cyan-400 font-bold">
                                            {userInitial}
                                        </AvatarFallback>
                                    </Avatar>
                                </Button>
                            }
                        />
                        <DropdownMenuContent className="w-56 mt-2 rounded-2xl shadow-2xl border-border bg-popover" align="end">
                            <DropdownMenuGroup>
                                <DropdownMenuLabel className="font-normal">
                                    <div className="flex flex-col space-y-1 p-2">
                                        <p className="text-sm font-black leading-none text-foreground">{user?.user_metadata?.full_name || 'Student'}</p>
                                        <p className="text-xs leading-none text-muted-foreground">
                                            {user?.email}
                                        </p>
                                    </div>
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator className="bg-border" />
                                <DropdownMenuItem className="rounded-xl m-1 cursor-pointer gap-2 focus:bg-cyan-500/10 text-muted-foreground focus:text-accent-foreground" render={<Link href="/dashboard/student/profile" />}>
                                    <IconUser size={16} />
                                    <span>{t('profile')}</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem className="rounded-xl m-1 cursor-pointer gap-2 focus:bg-cyan-500/10 text-muted-foreground focus:text-accent-foreground">
                                    <IconSettings size={16} />
                                    <span>{t('settings')}</span>
                                </DropdownMenuItem>
                            </DropdownMenuGroup>
                            <DropdownMenuSeparator className="bg-border" />
                            <DropdownMenuItem
                                className="rounded-xl m-1 cursor-pointer gap-2 text-red-400 focus:bg-red-500/10 focus:text-red-400 font-bold transition-colors"
                                onClick={handleLogout}
                            >
                                <IconLogout size={16} />
                                <span>{t('logout')}</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </header>
    );
}
