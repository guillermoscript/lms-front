
import payloadClient from "@/utils/axiosPayloadInstance";
import { apiUrl } from "@/utils/env";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";

export default function useMutationUpdateMessage() {
    return useMutation({
        mutationFn: async (data: any) => {
            const res = await payloadClient.patch(
                `${apiUrl}/api/user-messages/${data.id}`,
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