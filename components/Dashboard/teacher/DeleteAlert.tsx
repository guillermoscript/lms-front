"use client";
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
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";

export default function DeleteAlert({
    itemId,
    itemType,
    deleteAction,
}: {
    itemId: string;
    itemType: string;
    deleteAction: (id: string) => Promise<any>;
}) {
    return (
        <AlertDialog>
            <AlertDialogTrigger>
                Delete {itemType}
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        Are you absolutely sure?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        This action cannot be undone. This will permanently
                        delete the {itemType}.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        asChild
                    >
                        <Button
                            variant={'destructive'}
                            onClick={async () => {
                                const response = await deleteAction(itemId);

                                if (response.error) {
                                    console.log(response);
                                    return;
                                }
                            }}
                        >
                            Delete
                        </Button>
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}