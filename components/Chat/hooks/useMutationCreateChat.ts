import { Chat } from "@/payload-types";
import payloadClient from "@/utils/axiosPayloadInstance";
import { apiUrl } from "@/utils/env";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";

type ChatBody = {
    name: string;
    description: string;
    type?: Chat['type'];
}

export default function useMutationCreateChat() {
    return useMutation({
        mutationFn: async (data: ChatBody) => {
            const res = await payloadClient.post(
                `${apiUrl}/api/chats`,
                data,
                {
                    withCredentials: true,
                }
            );
        
            return res.data;
        }
    })
}