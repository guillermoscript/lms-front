import { useMutation } from "@tanstack/react-query";
import payloadClient from "../../../utils/axiosPayloadInstance"

type useMutationMarkAsCompleted = {
    id: string;
}

const postMutation = async ({ id }: useMutationMarkAsCompleted) => {
    const res = await payloadClient.post(`/api/evaluations/${id}/completed-by`)
    return res.data
}

export default function useMutationMarkAsCompleted() {

    const mutation = useMutation({
        mutationFn: postMutation,
        onSuccess: (data) => {
            console.log(data)
        },
        onError: (error) => {
            console.log(error)
        }

    })

    return mutation
}