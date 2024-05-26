"use client";
import { Link } from "lucide-react";
import { buttonVariants, Button } from "@/components/ui/button";
import { useFormState, useFormStatus } from "react-dom";
import { signIn } from "@/actions/auth/authActions";

export default function UserLoginForm() {
	const [state, action] = useFormState(signIn, {
		status: "idle",
		message: "",
		error: null,
	});

	console.log(state);

	return (
		<div className="flex-1 flex flex-col w-full px-8 sm:max-w-md justify-center gap-2">
			<Link
				href="/"
				className="absolute left-8 top-8 py-2 px-4 rounded-md no-underline text-foreground bg-btn-background hover:bg-btn-background-hover flex items-center group text-sm"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1"
				>
					<polyline points="15 18 9 12 15 6" />
				</svg>{" "}
				Back
			</Link>

			<form
				className="animate-in flex-1 flex flex-col w-full justify-center gap-2 text-foreground"
				action={action}
			>
				<label className="text-md" htmlFor="email">
					Email
				</label>
				<input
					className="rounded-md px-4 py-2 bg-inherit border mb-6"
					name="email"
					placeholder="you@example.com"
					required
				/>
				<label className="text-md" htmlFor="password">
					Password
				</label>
				<input
					className="rounded-md px-4 py-2 bg-inherit border mb-6"
					type="password"
					name="password"
					placeholder="••••••••"
					// pattern=".{8,}"
					required
				/>
				<SubmitButton />
				{state.error && (
					<p className="mt-4 p-4 bg-foreground/10 text-foreground text-center">
						{state.message}
					</p>
				)}
			</form>
		</div>
	);
}

function SubmitButton() {
	const { pending } = useFormStatus();
	return (
		<>
			<Button
				type="submit"
				className="disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed w-full"
				disabled={pending}
				
			>
				{pending ? "Submitting..." : "Login"}
			</Button>
		</>
	);
}
