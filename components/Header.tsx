import Link from "next/link";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import AuthButton from "./AuthButton";
import { DarkThemeToggle } from "./DarkThemeToggle";

export default function Header({ children }: { children: React.ReactNode }) {
	return (
		<header className="container z-40 bg-background">
			<div className="flex items-center justify-between py-6">
				<div className="flex gap-6 md:gap-10">
					<a
						className="hidden items-center space-x-2 md:flex"
						href="/"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width={24}
							height={24}
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth={2}
							strokeLinecap="round"
							strokeLinejoin="round"
							className="lucide lucide-command"
						>
							<path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />
						</svg>
						<span className="hidden font-bold sm:inline-block">
							Taxonomy
						</span>
					</a>
					<nav className="hidden gap-6 md:flex">
						<a
							className="flex items-center text-lg font-medium transition-colors hover:text-foreground/80 sm:text-sm text-foreground/60"
							href="/#features"
						>
							Features
						</a>
						<a
							className="flex items-center text-lg font-medium transition-colors hover:text-foreground/80 sm:text-sm text-foreground/60"
							href="/pricing"
						>
							Pricing
						</a>
						<Link
							className="flex items-center text-lg font-medium transition-colors hover:text-foreground/80 sm:text-sm text-foreground/60"
							href="/store"
						>
							Store
						</Link>
					</nav>
					<Sheet>
						<SheetTrigger
              className="flex items-center space-x-2 md:hidden"
            >
							Open
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width={24}
								height={24}
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth={2}
								strokeLinecap="round"
								strokeLinejoin="round"
								className="lucide lucide-command"
							>
								<path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />
							</svg>
						</SheetTrigger>
						<SheetContent>
							<SheetHeader>
								<SheetTitle>
									Are you sure absolutely sure?
								</SheetTitle>
								<SheetDescription>
									<nav className="flex justify-center items-center">
										<div className="w-full max-w-4xl flex justify-end items-center p-3 text-sm">
											<AuthButton />
										</div>
										<DarkThemeToggle />
									</nav>
                  {children}
								</SheetDescription>
							</SheetHeader>
						</SheetContent>
					</Sheet>
        {children}
				</div>
				<nav className="hidden md:flex justify-center items-center">
					<div className="w-full max-w-4xl flex justify-end items-center p-3 text-sm">
						{<AuthButton />}
					</div>
					<DarkThemeToggle />
				</nav>
			</div>
		</header>
	);
}
