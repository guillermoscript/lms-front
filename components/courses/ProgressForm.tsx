'use client'
import { upsertLessonProgress } from "@/actions/actions";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Database } from "@/utils/supabase/supabase";
import { useState } from "react";
import { useToast } from "../ui/use-toast";
import ButtonSubmitDashbaord from "../dashboard/ButtonSubmitDashbaord";

type ProgressFormProps = {
	lessonId: number;
    progressStatus: Database["public"]["Tables"]["lesson_progress"]["Row"]['progress_status']
};

export default  function ProgressForm({ lessonId, progressStatus }: ProgressFormProps) {

    const [progress, setProgress] = useState<ProgressFormProps['progressStatus']>(progressStatus)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<boolean>(false)
    const { toast } = useToast()

	return (
		<form 
            className="flex gap-4"
            action={ async formData => {

            if (!progress) {
                console.log("Progress is not valid")
                return
            }

            try {
                const data = await upsertLessonProgress(lessonId, progress)
                console.log(data)
                toast({
                    title: "Progress updated",
                    description: "Your progress has been updated",
                })
            } catch (error) {
                console.log(error)
                toast({
                    title: "Error",
                    description: "There was an error updating your progress",
                    variant: 'destructive'
                })
            }
        }}>
			<Select
                value={progress}
                onValueChange={(value) => {
                    setProgress(value)
                }}
            >
				<SelectTrigger className="w-[180px]">
					<SelectValue placeholder="Select progress status" />
				</SelectTrigger>
				<SelectContent>
					{
                        ['not_started', 'in_progress', 'completed'].map((progress_status) => (
                            <SelectItem
                                value={progress_status}
                            >
                                {progress_status}
                            </SelectItem>
                        ))
                    }
				</SelectContent>
			</Select>
            <ButtonSubmitDashbaord />
		</form>
	);
}
