import PlanCard from "@/components/plans/PlanCards";
import { createClient } from "@/utils/supabase/server";

export default async function PlanPage() {

	const supabase = createClient();

	const plans = await supabase.from("plans").select("*");

	if (plans.error) {
		console.log(plans.error);
		throw plans.error;
	}

	console.log(plans);

	const [starter, pro, enterprise] = plans.data;

	return (
		<section className="w-full py-12 md:py-24 lg:py-32 ">
			<div className="container px-4 md:px-6 flex flex-col gap-4 md:gap-8">
				<div className="space-y-6 text-center">
					<h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
						Pricing Plans
					</h2>
					<p className="mx-auto max-w-[700px] text-gray-500 md:text-xl/relaxed dark:text-gray-400">
						Choose the plan that fits your needs and budget. All
						plans come with a 30-day money-back guarantee.
					</p>
				</div>
				{/* <div className="mx-auto grid max-w-5xl grid-cols-1 items-start gap-6 sm:grid-cols-3"> */}
				<div className="mx-auto flex flex-col gap-6 sm:flex-row sm:justify-center sm:gap-6">
					<PlanCard
						title="Starter"
						description="Perfect for individuals and small teams."
						features={[
							"Up to 5 users",
							"5GB storage",
							"Basic features",
						]}
						price={9}
						buttonVariant="secondary"
						planId={starter.plan_id}
					/>
					<PlanCard
						title="Pro"
						description="Ideal for growing teams and businesses."
						features={[
							"Up to 25 users",
							"50GB storage",
							"Advanced features",
						]}
						price={29}
						oldPrice={39}
						isPopular
						buttonVariant="default"
						planId={pro.plan_id}
					/>
					{/* <PlanCard
						title="Enterprise"
						description="Tailored for large teams and organizations."
						features={[
							"Unlimited users",
							"Unlimited storage",
							"Enterprise features",
						]}
						price={99}
						buttonVariant="secondary"
					/> */}
				</div>
				<div className="mt-12 space-y-4 text-center">
					<p className="text-gray-500 dark:text-gray-400">
						All plans come with a 30-day money-back guarantee, 24/7
						support, and a user-friendly dashboard to manage your
						account.
					</p>
					<p className="text-gray-500 dark:text-gray-400">
						Upgrade or downgrade your plan at any time, no long-term
						contracts.
					</p>
					<p className="text-gray-500 dark:text-gray-400">
						Get started today and experience the best-in-class
						service and features.
					</p>
				</div>
			</div>
		</section>
	);
}
