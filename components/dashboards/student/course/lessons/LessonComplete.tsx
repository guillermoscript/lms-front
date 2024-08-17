import { CheckCircle } from 'lucide-react'

import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle
} from '@/components/ui/card'

interface LessonNavigationButtonsProps {
    courseId: number
    lessonId: number
    lessonName: string
}

const LessonComplete: React.FC<LessonNavigationButtonsProps> = async ({
    courseId,
    lessonId,
    lessonName
}) => {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Success
                    <CheckCircle
                        className='w-6 h-6 text-green-500'
                    />
                </CardTitle>
                <CardDescription>Lesson Completed</CardDescription>
            </CardHeader>
            <CardContent>

            </CardContent>
            <CardFooter>
                <p>Card Footer</p>
            </CardFooter>
        </Card>
    )
}

export default LessonComplete
