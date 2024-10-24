import { useCallback, useState } from 'react'
import { toast } from 'sonner'

interface UseApprovalHandlerProps {
    exerciseId: number;
    messages: any[]; // Adjust the type according to the actual structure of messages
    setIsCompleted: (value: boolean) => void;
    setIsNotApproved: (value: boolean) => void;
    setNotApprovedMessage: (message: string) => void;
    t: (key: string) => string;
    callback: () => void;
}

interface UseApprovalHandlerReturn {
    isLoading: boolean;
    handleCheckAnswer: () => Promise<void>;
}

// Custom hook to handle approval logic
const useApprovalHandler = ({
    exerciseId,
    messages,
    setIsCompleted,
    setIsNotApproved,
    setNotApprovedMessage,
    t,
    callback
}: UseApprovalHandlerProps): UseApprovalHandlerReturn => {
    const [isLoading, setIsLoading] = useState(false)

    const handleCheckAnswer = useCallback(async () => {
        setIsLoading(true)
        try {
            await callback()
        } catch (error) {
            console.error(error)
            toast.error(t('errorLoadingExercise'))
            setIsNotApproved(true)
        } finally {
            setIsLoading(false)
        }
    }, [
        exerciseId,
        messages,
        setIsCompleted,
        setIsNotApproved,
        setNotApprovedMessage,
        t,
    ])

    return { isLoading, handleCheckAnswer }
}

export default useApprovalHandler
