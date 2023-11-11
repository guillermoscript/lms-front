import payloadClient from "../../../utils/axiosPayloadInstance";
import qs from "qs";
import { PaginatedDocs } from "../../../utils/types/common";
import { ExamnsSubmission } from "../../../payload-types";
import { useQuery } from "@tanstack/react-query";

type ExamnSubmissionDto = {
    createdBy: string;
    evaluation: string;
}

const getExamnSubmission = async ({
    createdBy,
    evaluation,
}: ExamnSubmissionDto) => {

    const query = {
        where: {
            and: [
                {
                    createdBy: {
                        equals: createdBy
                    },
                },
                {
                    evaluation: {
                        equals: evaluation
                    },
                }
            ]
        }
    };
    const res = await payloadClient.get<PaginatedDocs<ExamnsSubmission>>(`/api/examns-submissions?${qs.stringify(query)}`);
    return res.data;
}

export default function useQueryExamnSubmission({ createdBy, evaluation }: ExamnSubmissionDto) {
    return useQuery({
        queryKey: ["examn-submission"],
        queryFn: () => getExamnSubmission({ createdBy, evaluation }),
        enabled: !!createdBy && !!evaluation,
    });
}