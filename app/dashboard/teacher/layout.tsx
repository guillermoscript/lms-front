/**
 * v0 by Vercel.
 * @see https://v0.dev/t/aeJzZVIZhlF
 * Documentation: https://v0.dev/docs#integrating-generated-code-into-your-nextjs-app
 */
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
	CardTitle,
	CardDescription,
	CardHeader,
	CardContent,
	Card,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	DropdownMenuTrigger,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuItem,
	DropdownMenuContent,
	DropdownMenu,
} from "@/components/ui/dropdown-menu";
import { Sidebar } from "@/components/dashboard/Sidebar";
import DashboardHeader from "@/components/dashboard/DashboardHeader";

export default function Component() {
	return (
		<div className="grid min-h-screen w-full lg:grid-cols-[280px_1fr]">
			<Sidebar />
			<div className="flex flex-col">
				<DashboardHeader />
				<main className="flex-1 flex flex-col gap-4 p-4 md:gap-8 md:p-6">
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
						<Card>
							<CardHeader>
								<CardTitle>Courses</CardTitle>
								<CardDescription>
									View and manage all your courses.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<div className="grid grid-cols-2 gap-4">
									<Link
										className="flex flex-col items-center gap-2 rounded-lg bg-gray-100 p-4 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
										href="#"
									>
										<LayoutGridIcon className="h-8 w-8 text-gray-500 dark:text-gray-400" />
										<span className="text-sm font-medium">
											Courses
										</span>
									</Link>
									<Link
										className="flex flex-col items-center gap-2 rounded-lg bg-gray-100 p-4 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
										href="#"
									>
										<BookIcon className="h-8 w-8 text-gray-500 dark:text-gray-400" />
										<span className="text-sm font-medium">
											Lessons
										</span>
									</Link>
									<Link
										className="flex flex-col items-center gap-2 rounded-lg bg-gray-100 p-4 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
										href="#"
									>
										<ClipboardIcon className="h-8 w-8 text-gray-500 dark:text-gray-400" />
										<span className="text-sm font-medium">
											Tests
										</span>
									</Link>
									<Link
										className="flex flex-col items-center gap-2 rounded-lg bg-gray-100 p-4 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
										href="#"
									>
										<UsersIcon className="h-8 w-8 text-gray-500 dark:text-gray-400" />
										<span className="text-sm font-medium">
											Students
										</span>
									</Link>
								</div>
							</CardContent>
						</Card>
						<Card>
							<CardHeader>
								<CardTitle>News</CardTitle>
								<CardDescription>
									Stay up-to-date with the latest news and
									updates.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<div className="space-y-4">
									<div className="flex items-start gap-4">
										<img
											alt="News thumbnail"
											className="rounded-md"
											height="64"
											src="/placeholder.svg"
											style={{
												aspectRatio: "64/64",
												objectFit: "cover",
											}}
											width="64"
										/>
										<div className="space-y-1">
											<h3 className="text-sm font-medium">
												New Course: Introduction to
												React
											</h3>
											<p className="text-sm text-gray-500 dark:text-gray-400">
												Learn the fundamentals of React
												and build your first web
												application.
											</p>
										</div>
									</div>
									<div className="flex items-start gap-4">
										<img
											alt="News thumbnail"
											className="rounded-md"
											height="64"
											src="/placeholder.svg"
											style={{
												aspectRatio: "64/64",
												objectFit: "cover",
											}}
											width="64"
										/>
										<div className="space-y-1">
											<h3 className="text-sm font-medium">
												Upcoming Webinar: Mastering
												JavaScript
											</h3>
											<p className="text-sm text-gray-500 dark:text-gray-400">
												Join our expert instructor for
												an in-depth look at advanced
												JavaScript concepts.
											</p>
										</div>
									</div>
									<div className="flex items-start gap-4">
										<img
											alt="News thumbnail"
											className="rounded-md"
											height="64"
											src="/placeholder.svg"
											style={{
												aspectRatio: "64/64",
												objectFit: "cover",
											}}
											width="64"
										/>
										<div className="space-y-1">
											<h3 className="text-sm font-medium">
												New Feature: Personalized
												Learning Paths
											</h3>
											<p className="text-sm text-gray-500 dark:text-gray-400">
												Customize your learning
												experience with our new
												personalized learning paths.
											</p>
										</div>
									</div>
								</div>
							</CardContent>
						</Card>
						<Card>
							<CardHeader>
								<CardTitle>Upcoming Tests</CardTitle>
								<CardDescription>
									View and prepare for your upcoming tests.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<div className="space-y-4">
									<div className="flex items-start gap-4">
										<div className="flex h-10 w-10 items-center justify-center rounded-md bg-gray-100 dark:bg-gray-800">
											<ClipboardIcon className="h-6 w-6 text-gray-500 dark:text-gray-400" />
										</div>
										<div className="space-y-1">
											<h3 className="text-sm font-medium">
												Introduction to Web Development
											</h3>
											<p className="text-sm text-gray-500 dark:text-gray-400">
												Due: April 15, 2023
											</p>
										</div>
									</div>
									<div className="flex items-start gap-4">
										<div className="flex h-10 w-10 items-center justify-center rounded-md bg-gray-100 dark:bg-gray-800">
											<ClipboardIcon className="h-6 w-6 text-gray-500 dark:text-gray-400" />
										</div>
										<div className="space-y-1">
											<h3 className="text-sm font-medium">
												Intermediate JavaScript
											</h3>
											<p className="text-sm text-gray-500 dark:text-gray-400">
												Due: May 1, 2023
											</p>
										</div>
									</div>
									<div className="flex items-start gap-4">
										<div className="flex h-10 w-10 items-center justify-center rounded-md bg-gray-100 dark:bg-gray-800">
											<ClipboardIcon className="h-6 w-6 text-gray-500 dark:text-gray-400" />
										</div>
										<div className="space-y-1">
											<h3 className="text-sm font-medium">
												Foundations of Data Science
											</h3>
											<p className="text-sm text-gray-500 dark:text-gray-400">
												Due: June 1, 2023
											</p>
										</div>
									</div>
								</div>
							</CardContent>
						</Card>
					</div>
				</main>
			</div>
		</div>
	);
}

function BellIcon(props) {
	return (
		<svg
			{...props}
			xmlns="http://www.w3.org/2000/svg"
			width="24"
			height="24"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
			<path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
		</svg>
	);
}

function BookIcon(props) {
	return (
		<svg
			{...props}
			xmlns="http://www.w3.org/2000/svg"
			width="24"
			height="24"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
		</svg>
	);
}

function ClipboardIcon(props) {
	return (
		<svg
			{...props}
			xmlns="http://www.w3.org/2000/svg"
			width="24"
			height="24"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
			<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
		</svg>
	);
}

function HomeIcon(props) {
	return (
		<svg
			{...props}
			xmlns="http://www.w3.org/2000/svg"
			width="24"
			height="24"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
			<polyline points="9 22 9 12 15 12 15 22" />
		</svg>
	);
}

function LayoutGridIcon(props) {
	return (
		<svg
			{...props}
			xmlns="http://www.w3.org/2000/svg"
			width="24"
			height="24"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<rect width="7" height="7" x="3" y="3" rx="1" />
			<rect width="7" height="7" x="14" y="3" rx="1" />
			<rect width="7" height="7" x="14" y="14" rx="1" />
			<rect width="7" height="7" x="3" y="14" rx="1" />
		</svg>
	);
}

function SearchIcon(props) {
	return (
		<svg
			{...props}
			xmlns="http://www.w3.org/2000/svg"
			width="24"
			height="24"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<circle cx="11" cy="11" r="8" />
			<path d="m21 21-4.3-4.3" />
		</svg>
	);
}

function UsersIcon(props) {
	return (
		<svg
			{...props}
			xmlns="http://www.w3.org/2000/svg"
			width="24"
			height="24"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
			<circle cx="9" cy="7" r="4" />
			<path d="M22 21v-2a4 4 0 0 0-3-3.87" />
			<path d="M16 3.13a4 4 0 0 1 0 7.75" />
		</svg>
	);
}
