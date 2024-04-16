import { updateProfile } from "@/actions/actions";
import SaveButtonForm from "@/components/form/SaveButtonForm";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

export default async function Dashboard() {
	const cookieStore = cookies();
	const supabase = createClient(cookieStore);
	const {
		data: { user },
	} = await supabase.auth.getUser();

	console.log(user);

	const userProfile = await supabase
		.from("profiles")
		.select("*")
		.eq("id", user?.id)
		.single();

	console.log(userProfile.data);

	return (
		<>
			<div className="space-y-6">
				<div>
					<h3 className="text-lg font-medium">Account</h3>
					<p className="text-sm text-muted-foreground">
						Update your account settings.
					</p>
				</div>
				{/* <Separator /> */}
				<form className="space-y-6" action={updateProfile}>
					<div>
						<label
							htmlFor="name"
							className="block text-sm font-medium text-muted-foreground"
						>
							Name
						</label>
						<div className="mt-1">
							<input
								type="text"
								name="name"
								id="name"
								autoComplete="name"
								value={userProfile.data?.full_name}
								className="shadow-sm p-3 focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
							/>
						</div>
					</div>
					<div>
						<label
							htmlFor="photo"
							className="block text-sm font-medium text-muted-foreground"
						>
							Photo
						</label>
						<div className="mt-1">
							<input
								type="file"
								name="photo"
								id="photo"
								autoComplete="photo"
								className="shadow-sm p-3 focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
							/>
						</div>
					</div>
					<div>
						<label
							htmlFor="bio"
							className="block text-sm font-medium text-muted-foreground"
						>
							Bio
						</label>
						<div className="mt-1">
							<textarea
								id="bio"
								name="bio"
								rows={3}
								className="shadow-sm p-3 focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
								defaultValue={userProfile.data?.bio}
							/>
						</div>
					</div>
					<SaveButtonForm />
				</form>
			</div>
		</>
	);
}

