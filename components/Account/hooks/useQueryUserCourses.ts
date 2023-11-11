import { useQuery } from "@tanstack/react-query";
import { Enrollment } from "../../../payload-types";
import payloadClient from "../../../utils/axiosPayloadInstance";
import { PaginatedDocs } from "../../../utils/types/common";
import qs from "qs";


const query = {
    status: {
        equals: "active",
    },
};
const getUserCourses = async () => {
    const stringifiedQuery = qs.stringify(
        {
          where: query, // ensure that `qs` adds the `where` property, too!
        },
        { addQueryPrefix: true }
    );
    const response = await payloadClient.get<PaginatedDocs<Enrollment>>('/api/enrollments' + stringifiedQuery);
    return response.data;
}

export default function useQueryUserCourses() {

    const query = useQuery({
        queryKey: ['enrollments'], 
        queryFn: getUserCourses,
    });
    return query;
}