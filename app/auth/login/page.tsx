import Link from "next/link";
import { headers, cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import AuthForm from "@/components/auth/auth-form";
import UserAuthForm from "@/components/auth/UserAuthForm";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/utils";
import Image from "next/image";
import Header from "@/components/Header";
import AuthButton from "@/components/AuthButton";

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
						Create an account
					</h1>
					<p className="text-sm text-muted-foreground">
						Enter your email below to create your account
					</p>
				</div>
				<UserAuthForm searchParams={searchParams} />
				<p className="px-8 text-center text-sm text-muted-foreground">
					By clicking continue, you agree to our{" "}
					<Link
						href="/terms"
						className="underline underline-offset-4 hover:text-primary"
					>
						Terms of Service
					</Link>{" "}
					and{" "}
					<Link
						href="/privacy"
						className="underline underline-offset-4 hover:text-primary"
					>
						Privacy Policy
					</Link>
					.
				</p>
        <Link href="/auth/forgot-password" className="text-center text-sm cursor-pointer text-primary">
          Forgot your password?
        </Link>
			</div>
		</>
	);
}
