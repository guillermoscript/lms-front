
import { deleteCourseAction } from '@/actions/dashboard/courseActions'

import DeleteAlert from '../DeleteAlert'

export default function DeleteCourseAlert ({ courseId }: { courseId: number }) {
    return (
        <DeleteAlert
            itemId={courseId.toString()}
            itemType="Course"
            deleteAction={async (id: string) => await deleteCourseAction({ courseId: id })}
        />
    )
}
