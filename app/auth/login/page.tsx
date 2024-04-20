import Link from "next/link";
import UserLoginForm from "@/components/auth/UserLoginForm";
import { buttonVariants } from "@/components/ui/button";

export default function Login({
	searchParams,
}: {
	searchParams: { message: string };
}) {
	return (
		<>
			<div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
				<div className="flex flex-col space-y-2 text-center">
					<h1 className="text-2xl font-semibold tracking-tight">
						Login to your account
					</h1>
					<p className="text-sm text-muted-foreground">
						Enter your email below to login
					</p>
				</div>
				<UserLoginForm />
				{searchParams.message && (
					<p className="text-center text-red-500 text-sm">
						{searchParams.message}
					</p>
				)}
				<Link
					href="/auth/forgot-password"
					className="text-center text-sm cursor-pointer text-primary"
				>
					Forgot your password?
				</Link>
				<Link 
					href="/auth/signup"
					className={buttonVariants({variant: 'secondary'})}
				>
					Don't have an account? Sign up
				</Link>
			</div>
		</>
	);
}
