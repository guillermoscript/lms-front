import payloadClient from "@/utils/axiosPayloadInstance";
import { apiUrl } from "@/utils/env";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";

type UseMutationUploadAudio = {
	progress?: any;
}

export default function useMutationUploadAudio({
	progress
}: UseMutationUploadAudio) {
	return useMutation({
		mutationFn: async (file: File) => {
			const formData = new FormData();
			formData.append("file", file);
			const res = await payloadClient.post(`${apiUrl}/api/audios`, formData, {
				withCredentials: true,
				onUploadProgress(progressEvent) {
					const percentCompleted = Math.round(
						(progressEvent.loaded * 100) / progressEvent?.total!
					);
					if (progress) progress(percentCompleted);
				},
			});
			return res.data;
		},
		onError(error, variables, context) {
			console.log(error);
		}
	});
}