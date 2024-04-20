"use client"; // Error components must be Client Components

import GenericError from "@/components/GenericError";
import { useEffect } from "react";

export default function Error({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		// Log the error to an error reporting service
		console.error(error);
	}, [error]);

	return (
		<GenericError
			retry={reset}
			title="An error occurred"
			description="An unexpected error occurred. Please try again."
		/>
	);
}
