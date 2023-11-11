import payloadClient from "@/utils/axiosPayloadInstance";
import { apiUrl } from "@/utils/env";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";

export default function useMutationMessage() {
    return useMutation({
        mutationFn: async (data: any) => {
            const res = await payloadClient.post(
                `${apiUrl}/api/user-messages`,
                {
                    ...data,
                },
                {
                    withCredentials: true,
                }
            );
    
            return res.data;
        },
        onSuccess(data, variables, context) {
            console.log(data);
        },
    });
    
} 