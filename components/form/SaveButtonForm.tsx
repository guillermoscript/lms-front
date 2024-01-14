'use client'
import { useFormStatus } from "react-dom"
import { Button } from "../ui/button"

type SaveButtonFormProps = {
    isValid?: boolean
}

export default function SaveButtonForm({ isValid }: SaveButtonFormProps) {

	const { pending } = useFormStatus()

	return (
		<Button
			disabled={pending}
		>
			{
				pending ? "Submitting..." : "Submit"
			}
		</Button>
	)
}