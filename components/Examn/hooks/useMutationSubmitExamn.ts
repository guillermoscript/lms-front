import { useMutation } from "@tanstack/react-query";
import payloadClient from "../../../utils/axiosPayloadInstance"
import { useRouter } from "next/router";

type useMutationSubmitExamn = {
    formID: string;
    submissionData: {
        field: string;
        value: unknown;
    }[],
    evaluation: string;
}

const postMutation = async ({ formID, evaluation, submissionData }: useMutationSubmitExamn) => {

    console.log(formID, evaluation, submissionData)
    const res = await payloadClient.post(`/api/examns-submissions`, {
        form: formID,
        submissionData: submissionData,
        evaluation
    })

    return res.data
}

export default function useMutationSubmitExamn(handleSuccess: any) {

    const router = useRouter()
    const { examnId } = router.query

    const mutation = useMutation({
        mutationFn: (data: useMutationSubmitExamn) => {
            return postMutation({
                formID: data.formID,
                submissionData: data.submissionData,
                evaluation: examnId as string
            })
        },
        onSuccess: (data) => {
            console.log(data)
            handleSuccess()
        },
        onError: (error) => {
            console.log(error)
        }

    })

    return mutation
}