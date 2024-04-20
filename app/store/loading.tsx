import { Skeleton } from "@/components/ui/skeleton";

function LoadingCard() {
	return (
		<div className="flex flex-col space-y-3">
			<Skeleton className="h-[125px] w-[250px] rounded-xl" />
			<div className="space-y-2">
				<Skeleton className="h-4 w-[250px]" />
				<Skeleton className="h-4 w-[200px]" />
			</div>
		</div>
	);
}

export default function Index() {

	return (
		<div className="flex min-h-screen p-4 space-y-4">

			{[1, 2, 3, 4, 5, 6].map((item) => <LoadingCard key={item} />)}
		</div>
	)
}
