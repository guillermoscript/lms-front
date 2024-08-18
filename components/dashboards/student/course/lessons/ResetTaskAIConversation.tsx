'use client'
import { studentResetAiTaskConversation } from '@/actions/dashboard/lessonsAction'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { ResetIcon } from '@radix-ui/react-icons'
import { useState } from 'react'
import { toast } from 'sonner'

export default function ResetTaskAIConversation({
    lessonId,
}: {
    lessonId: number
}) {
    const [open, setOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)

    return (
        <div className="w-full px-4 flex items-end justify-end">
            <AlertDialog open={open} onOpenChange={setOpen}>
                <AlertDialogTrigger asChild>
                    <Button className="flex items-center space-x-2">
                        <ResetIcon />
                        <span>Reset Conversation</span>
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Are you absolutely sure?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently
                            delete the conversation.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={async () => {
                                setOpen(true)
                                try {
                                    // Reset the conversation
                                    setIsLoading(true)
                                    const res =
                                        await studentResetAiTaskConversation({
                                            lessonId,
                                        })
                                    if (res.status === 'success') {
                                        toast.success(
                                            'Conversation reset successfully'
                                        )
                                    } else {
                                        toast.error(
                                            'Failed to reset conversation'
                                        )
                                    }
                                } catch (error) {
                                    console.error(error)
                                    toast.error('Failed to reset conversation')
                                } finally {
                                    setIsLoading(false)
                                    setOpen(false)
                                    window.location.reload()
                                }
                            }}

                            disabled={isLoading}
                        >
                            {isLoading ? 'Loading...' : 'Reset'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
