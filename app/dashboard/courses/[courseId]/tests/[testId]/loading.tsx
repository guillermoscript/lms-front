import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingTest() {
	return (
		<div className="grid grid-cols-1 gap-6">
			<div className="space-y-6">
				<div className="flex flex-col gap-4">
					<Skeleton className="h-8 w-3/4" />
					<Skeleton className="h-6 w-full" />
					<div className="flex items-center gap-4">
						<Skeleton className="h-5 w-20" />
						<div className="h-6 w-px bg-gray-300 dark:bg-gray-700" />
						<Skeleton className="h-5 w-24" />
					</div>
				</div>
				<div className="space-y-4">
					<Skeleton className="h-6 w-1/2" />
					<div className="grid grid-cols-[auto_1fr] items-center gap-4">
						<Skeleton className="h-5 w-5" />
						<Skeleton className="h-5 w-full" />
					</div>
					<div className="grid grid-cols-[auto_1fr] items-center gap-4">
						<Skeleton className="h-5 w-5" />
						<Skeleton className="h-5 w-full" />
					</div>
					<div className="grid grid-cols-[auto_1fr] items-center gap-4">
						<Skeleton className="h-5 w-5" />
						<Skeleton className="h-5 w-full" />
					</div>
				</div>
				<div className="space-y-4">
					<Skeleton className="h-6 w-1/2" />
					<div>
						<Skeleton className="h-5 w-full" />
						<div className="mt-2 space-y-2">
							<div className="grid grid-cols-[auto_1fr] items-center gap-4">
								<Skeleton className="h-5 w-5" />
								<Skeleton className="h-5 w-full" />
							</div>
							<div className="grid grid-cols-[auto_1fr] items-center gap-4">
								<Skeleton className="h-5 w-5" />
								<Skeleton className="h-5 w-full" />
							</div>
							<div className="grid grid-cols-[auto_1fr] items-center gap-4">
								<Skeleton className="h-5 w-5" />
								<Skeleton className="h-5 w-full" />
							</div>
							<div className="grid grid-cols-[auto_1fr] items-center gap-4">
								<Skeleton className="h-5 w-5" />
								<Skeleton className="h-5 w-full" />
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
