import { Skeleton } from "@/components/ui/skeleton";

export default function SkeletonDemo() {
	return (
		<div className="flex w-full min-h-screen  space-x-4">
			<div className="flex-1 space-y-2 w-full">
				<Skeleton className="h-96 w-full" />
				<Skeleton className="h-72 w-full" />
			</div>

		</div>
	);
}
