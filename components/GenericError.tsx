
import { AlertTriangleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

type Props = {
    retry: () => void;
    children?: React.ReactNode;
    title?: string;
    description?: string;
}

export default function GenericError({ retry, children, title, description }: Props) {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
			<div className="max-w-md w-full bg-white dark:bg-gray-800 shadow-lg rounded-lg p-8 space-y-6">
				<div className="flex flex-col items-center">
					<AlertTriangleIcon className="h-16 w-16 text-red-500" />
					<h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-4">
						{title ? title : "Oops, something went wrong!"}
					</h1>
					<p className="text-gray-600 dark:text-gray-400 mt-2">
						{description ? description : "There was an issue processing your request. Please try again later."}
					</p>
				</div>
				<div className="border-t border-gray-200 dark:border-gray-700 pt-6 space-y-4">
					<div className="flex justify-center gap-4">
						<Button variant={"secondary"} onClick={retry}>
							Retry
						</Button>
						<Link
							className="inline-flex items-center justify-center px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-md shadow-sm text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 dark:bg-gray-700 dark:hover:bg-gray-600 dark:focus:ring-gray-600"
							href="#"
						>
							Contact Support
						</Link>
					</div>
					
				</div>
                {children}
			</div>
		</div>
    )
}