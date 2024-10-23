import { Check, Loader } from 'lucide-react'
import { MouseEventHandler, ReactNode } from 'react'

import { Button } from '@/components/ui/button'

interface ApprovalButtonProps {
    isLoading: boolean
    isCompleted: boolean
    onCheckAnswer: MouseEventHandler<HTMLButtonElement>
    disabled?: boolean
    children: ReactNode
}

const ApprovalButton: React.FC<ApprovalButtonProps> = ({
    isLoading,
    isCompleted,
    onCheckAnswer,
    disabled = false,
    children,
}) => (
    <Button
        onClick={onCheckAnswer}
        disabled={isLoading || isCompleted || disabled}
        className="mt-4"
    >
        {isLoading ? (
            <Loader className="animate-spin" />
        ) : (
            <>
                {children}
                <Check className="h-4 w-4 ml-2" />
            </>
        )}
    </Button>
)

export default ApprovalButton
