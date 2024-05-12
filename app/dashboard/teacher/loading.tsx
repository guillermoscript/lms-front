import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
	return (
		<div className="flex-1 p-4 md:p-6">
			<div className="flex items-center">
				<Skeleton className="h-6 w-40 rounded-md" />
				<Skeleton className="h-8 w-20 ml-auto rounded-md" />
			</div>
			<div className="mt-4 border rounded-lg shadow-sm">
				<Skeleton className="h-[200px] w-full rounded-t-lg" />
				<div className="p-4 md:p-6">
					<div className="space-y-4">
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-full" />
					</div>
				</div>
			</div>
		</div>
	);
}
