import { courseSchemaType } from '@/components/dashboards/teacher/course/CreateCourse'
import { createResponse } from '@/utils/functions'

export async function linkProductAction (data: courseSchemaType) {
    console.log(data)

    if (!data.price || !data.status || !data.course_id) {
        return createResponse('error', 'Please fill in all fields', null, null)
    }

    return createResponse('success', 'Product linked successfully', null, null)
}
