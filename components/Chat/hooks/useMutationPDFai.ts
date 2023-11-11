import { Message } from "@/payload-types";
import payloadClient from "@/utils/axiosPayloadInstance";
import { apiUrl } from "@/utils/env";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
export default function useMutationPDFai() {
	return useMutation({
		mutationFn: async ({
			documentId,
			chatId,
		}: {
			documentId: string;
			chatId: string;
		}) => {
			const res = await payloadClient.post(
				`${apiUrl}/api/pdf/embedding`,
				{
					documentId: documentId,
					chatId: chatId,
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
