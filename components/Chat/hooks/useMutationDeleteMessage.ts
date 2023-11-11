import qs from 'qs'
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { apiUrl } from '@/utils/env';
import payloadClient from '@/utils/axiosPayloadInstance';

export default function useMutationDeleteMessage() {
    return useMutation({
        mutationFn: async (data: {
            ids: string[],
        }) => {

            const query = {
                where: {
                    id: {
                        in: data.ids,
                    },
                },
            }

            const res = await payloadClient.delete(
                `${apiUrl}/api/user-messages${qs.stringify(query, { addQueryPrefix: true })}`,
                {
                    withCredentials: true,
                    
                },
            );
    
            return res.data;
        },
        onSuccess(data, variables, context) {
            console.log(data);
        },
    });
    
} 