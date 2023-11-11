import { useQuery } from "@tanstack/react-query";
import { PaymentMethod } from "../../../payload-types";
import payloadClient from "../../../utils/axiosPayloadInstance";
import { apiUrl } from "../../../utils/env";
import { PaginatedDocs } from "../../../utils/types/common";

const getUserPaymentMethods = async () => {
    try {
        const res = await payloadClient.get<PaginatedDocs<PaymentMethod>>(
            apiUrl + '/api/payment-methods',
            {
                // Make sure to include cookies with fetch
                withCredentials: true,
            },
        );

        return res.data;
    } catch (error) {
        throw new Error('Error fetching payment methods');
    }
}

export default function useQueryPaymentMethods() {

    const query = useQuery({
        queryKey: ['paymentMethods'], 
        queryFn: getUserPaymentMethods,
    });
    return query;
}