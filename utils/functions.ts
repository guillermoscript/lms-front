import { ApiResponse } from "@/actions/actions";

export function createResponse<T>(
    status: "success" | "error" | "idle",
    message: string,
    data?: T,
    error?: any
): ApiResponse<T> {
    return {
        status,
        message,
        data,
        error,
    };
}