import { DaisyUiAlert } from "../Alert/DaisyUiAlerts";
import { LoadSpinner } from "../Loaders/DaisyUiLoaders";

type MutationStatesUiControllerProps = {
    mutation: any;
    errorText: string;
    successText: string;
};

export default function MutationStatesUiController({ mutation, errorText, successText }: MutationStatesUiControllerProps) {
    return (
        <div className="flex justify-center my-4">
            {mutation.isLoading && <div className="flex justify-center">
                <LoadSpinner size="lg" />
            </div>}
            {mutation.isError && <DaisyUiAlert type="error" message={errorText} />}
            {mutation.isSuccess && <DaisyUiAlert type="success" message={successText} />}
        </div>
    )
}