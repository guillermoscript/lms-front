
import { deleteTestAction } from "@/actions/dashboard/testActions";
import DeleteAlert from "../DeleteAlert";

export default function DeleteTestAlert({ testId }: { testId: string }) {
    return (
        <DeleteAlert
            itemId={testId}
            itemType="Test"
            deleteAction={(id: string) => deleteTestAction({ testId: id })}
        />
    );
}