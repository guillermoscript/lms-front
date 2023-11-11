import { useQuery } from "@tanstack/react-query";
import { Order } from "../../../payload-types";
import payloadClient from "../../../utils/axiosPayloadInstance";
import { PaginatedDocs } from "../../../utils/types/common";

const getUSerOrders = async () => {
    try {
        const response = await payloadClient.get<PaginatedDocs<Order>>('/api/orders', {
            // Make sure to include cookies with fetch
            withCredentials: true,
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'JWT ' + localStorage.getItem('token'),
            },
        });

        return response.data;
    } catch (error) {
        throw new Error('Error fetching orders');
    }
}

export default function useQueryUserOrders() {
    
    const query = useQuery({
        queryKey: ['UserOrders'],
        queryFn: getUSerOrders,
    });
    return query;
}