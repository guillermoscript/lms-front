import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

export const ProgressCard = ({
    completedLessons, totalLessons, completedExams, totalExams, completedExercises, totalExercises, t
}) => (
    <Card className="mb-8">
        <CardHeader>
            <CardTitle>{t('dashboard.student.CourseStudentPage.progressTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
            <div className="space-y-4">
                {[{
                    label: t('dashboard.student.CourseStudentPage.lessonsCompleted'),
                    completed: completedLessons,
                    total: totalLessons
                }, {
                    label: t('dashboard.student.CourseStudentPage.examsCompleted'),
                    completed: completedExams,
                    total: totalExams
                }, {
                    label: t('dashboard.student.CourseStudentPage.exercisesCompleted'),
                    completed: completedExercises,
                    total: totalExercises
                }].map(({ label, completed, total }) => (
                    <div key={label}>
                        <div className="flex justify-between mb-1">
                            <span className="text-sm font-medium">{label}</span>
                            <span className="text-sm font-medium">{completed}/{total}</span>
                        </div>
                        <Progress value={(completed / total) * 100} className="h-2" />
                    </div>
                ))}
            </div>
        </CardContent>
    </Card>
)
