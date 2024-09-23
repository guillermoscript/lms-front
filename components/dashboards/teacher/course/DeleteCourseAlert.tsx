'use client'
import { deleteCourseAction } from '@/actions/dashboard/courseActions'
import { useScopedI18n } from '@/app/locales/client'

import DeleteAlert from '../DeleteAlert'

export default function DeleteCourseAlert ({ courseId }: { courseId: number }) {
    const t = useScopedI18n('DeleteCourseAlert')

    return (
        <DeleteAlert
            itemId={courseId.toString()}
            itemType={t('course')}
            deleteAction={async (id: string) => await deleteCourseAction({ courseId: id })}
        />
    )
}
