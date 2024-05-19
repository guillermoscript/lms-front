import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckIcon } from "lucide-react";
import { cn } from "@/utils";
import Link from "next/link";

type PlanCardProps = {
	title: string;
	description: string;
	features: string[];
	price: number;
	oldPrice?: number;
	isPopular?: boolean;
	buttonVariant?: "default" | "secondary";
	planId: number;
};

const PlanCard = ({
	title,
	description,
	features,
	price,
	oldPrice,
	isPopular,
	buttonVariant,
    planId,
}: PlanCardProps) => {
	return (
		<Link
            href={`/plans/${planId}`}
			className={`rounded-lg border ${
				isPopular ? "border-2 border-primary" : "border-gray-200"
			} bg-white p-6 shadow-sm dark:${
				isPopular ? "border-primary" : "border-gray-800"
			} dark:bg-gray-950 hover:scale-105 transition-transform duration-300 ease-in-out`}
		>
			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<h3 className="text-2xl font-bold">{title}</h3>
					{isPopular && (
						<Badge
							className="rounded-full px-3 py-1 text-xs font-medium bg-primary text-white animate-pulse"
							variant="default"
						>
							Most Popular
						</Badge>
					)}
				</div>
				<p className="text-gray-500 dark:text-gray-400">
					{description}
				</p>
				<ul className="space-y-2 text-sm">
					{features.map((feature, index) => (
						<li key={index} className="flex items-center">
							<CheckIcon className="mr-2 h-4 w-4 fill-primary animate-bounce" />
							{feature}
						</li>
					))}
				</ul>
				<div className="flex items-center justify-between">
					<div className="space-y-1">
						<span
							className={cn(
								"text-4xl font-bold",
								isPopular ? "text-primary" : "text-gray-900"
							)}
						>
							${price}
						</span>
						{oldPrice && (
							<p className="text-sm text-gray-500 line-through dark:text-gray-400">
								${oldPrice} per month
							</p>
						)}
					</div>
					<Button size="sm" variant={buttonVariant}>
						Get Started
					</Button>
				</div>
			</div>
		</Link>
	);
};

export default PlanCard;
