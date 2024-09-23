'use client'
import { Trash } from 'lucide-react'

import { useScopedI18n } from '@/app/locales/client'
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

export default function DeleteAlert({
    itemId,
    itemType,
    deleteAction,
}: {
    itemId: string
    itemType: string
    deleteAction: (id: string) => Promise<any>
}) {
    const t = useScopedI18n('DeleteAlert')

    return (
        <AlertDialog>
            <Button asChild variant="ghost" className="w-full">
                <AlertDialogTrigger>
                    <Trash />
                    {itemType}</AlertDialogTrigger>
            </Button>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        {t('title')}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        {t('description')}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>
                        {t('cancel')}
                    </AlertDialogCancel>
                    <AlertDialogAction asChild>
                        <Button
                            variant={'destructive'}
                            onClick={async () => {
                                const response = await deleteAction(itemId)

                                if (response.error) {
                                    console.log(response)
                                }
                            }}
                        >
                            {t('delete')}
                        </Button>
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
