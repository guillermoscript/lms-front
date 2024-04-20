/**
 * v0 by Vercel.
 * @see https://v0.dev/t/wutAn2oCKcj
 * Documentation: https://v0.dev/docs#integrating-generated-code-into-your-nextjs-app
 */
import { Skeleton } from "@/components/ui/skeleton";
import { CardContent, Card } from "@/components/ui/card";

export default function Component() {
	return (
		<div className="w-full max-w-6xl mx-auto px-4 md:px-6 py-12 md:py-20">
			<div className="grid md:grid-cols-2 gap-10 md:gap-16">
				<div className="flex flex-col gap-6">
					<div>
						<Skeleton className="inline-block rounded-lg h-6 w-24 mb-4" />
						<Skeleton className="h-8 w-[300px] mb-2" />
						<Skeleton className="h-6 w-[400px]" />
					</div>
					<div className="flex items-center gap-4">
						<Skeleton className="h-10 w-20" />
						<Skeleton className="h-6 w-16" />
					</div>
					<div className="grid gap-2">
						<div className="flex items-center gap-2">
							<Skeleton className="h-5 w-5 rounded-full" />
							<Skeleton className="h-4 w-40" />
						</div>
						<div className="flex items-center gap-2">
							<Skeleton className="h-5 w-5 rounded-full" />
							<Skeleton className="h-4 w-40" />
						</div>
						<div className="flex items-center gap-2">
							<Skeleton className="h-5 w-5 rounded-full" />
							<Skeleton className="h-4 w-40" />
						</div>
						<div className="flex items-center gap-2">
							<Skeleton className="h-5 w-5 rounded-full" />
							<Skeleton className="h-4 w-40" />
						</div>
					</div>
					<Skeleton className="h-10 w-full" />
				</div>
				<div className="grid gap-6">
					<Skeleton className="h-[300px] rounded-lg" />
					<div className="grid md:grid-cols-2 gap-6">
						<Skeleton className="h-[150px] rounded-lg" />
						<Skeleton className="h-[150px] rounded-lg" />
					</div>
				</div>
			</div>
			<div className="mt-12 md:mt-20">
				<Skeleton className="h-8 w-[300px] mb-6" />
				<div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
					<Card>
						<CardContent className="space-y-4">
							<div className="flex items-center gap-3">
								<Skeleton className="h-12 w-12 rounded-full" />
								<div>
									<Skeleton className="h-5 w-24 mb-1" />
									<Skeleton className="h-4 w-20" />
								</div>
							</div>
							<Skeleton className="h-6 w-full" />
							<Skeleton className="h-6 w-full" />
							<Skeleton className="h-6 w-full" />
						</CardContent>
					</Card>
					<Card>
						<CardContent className="space-y-4">
							<div className="flex items-center gap-3">
								<Skeleton className="h-12 w-12 rounded-full" />
								<div>
									<Skeleton className="h-5 w-24 mb-1" />
									<Skeleton className="h-4 w-20" />
								</div>
							</div>
							<Skeleton className="h-6 w-full" />
							<Skeleton className="h-6 w-full" />
							<Skeleton className="h-6 w-full" />
						</CardContent>
					</Card>
					<Card>
						<CardContent className="space-y-4">
							<div className="flex items-center gap-3">
								<Skeleton className="h-12 w-12 rounded-full" />
								<div>
									<Skeleton className="h-5 w-24 mb-1" />
									<Skeleton className="h-4 w-20" />
								</div>
							</div>
							<Skeleton className="h-6 w-full" />
							<Skeleton className="h-6 w-full" />
							<Skeleton className="h-6 w-full" />
						</CardContent>
					</Card>
				</div>
			</div>
			<div className="mt-12 md:mt-20">
				<Skeleton className="h-8 w-[300px] mb-6" />
				<div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
					<Card>
						<CardContent className="space-y-4">
							<div className="flex items-center gap-3">
								<Skeleton className="h-16 w-16 rounded-lg" />
								<div>
									<Skeleton className="h-5 w-32 mb-1" />
									<Skeleton className="h-4 w-20" />
								</div>
							</div>
							<Skeleton className="h-6 w-full" />
						</CardContent>
					</Card>
					<Card>
						<CardContent className="space-y-4">
							<div className="flex items-center gap-3">
								<Skeleton className="h-16 w-16 rounded-lg" />
								<div>
									<Skeleton className="h-5 w-32 mb-1" />
									<Skeleton className="h-4 w-20" />
								</div>
							</div>
							<Skeleton className="h-6 w-full" />
						</CardContent>
					</Card>
					<Card>
						<CardContent className="space-y-4">
							<div className="flex items-center gap-3">
								<Skeleton className="h-16 w-16 rounded-lg" />
								<div>
									<Skeleton className="h-5 w-32 mb-1" />
									<Skeleton className="h-4 w-20" />
								</div>
							</div>
							<Skeleton className="h-6 w-full" />
						</CardContent>
					</Card>
					<Card>
						<CardContent className="space-y-4">
							<div className="flex items-center gap-3">
								<Skeleton className="h-16 w-16 rounded-lg" />
								<div>
									<Skeleton className="h-5 w-32 mb-1" />
									<Skeleton className="h-4 w-20" />
								</div>
							</div>
							<Skeleton className="h-6 w-full" />
						</CardContent>
					</Card>
					<Card>
						<CardContent className="space-y-4">
							<div className="flex items-center gap-3">
								<Skeleton className="h-16 w-16 rounded-lg" />
								<div>
									<Skeleton className="h-5 w-32 mb-1" />
									<Skeleton className="h-4 w-20" />
								</div>
							</div>
							<Skeleton className="h-6 w-full" />
						</CardContent>
					</Card>
					<Card>
						<CardContent className="space-y-4">
							<div className="flex items-center gap-3">
								<Skeleton className="h-16 w-16 rounded-lg" />
								<div>
									<Skeleton className="h-5 w-32 mb-1" />
									<Skeleton className="h-4 w-20" />
								</div>
							</div>
							<Skeleton className="h-6 w-full" />
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
