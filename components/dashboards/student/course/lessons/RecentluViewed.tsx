import dayjs from 'dayjs'
import { Eye } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

import { buttonVariants } from '@/components/ui/button'
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselNext,
    CarouselPrevious,
} from '@/components/ui/carousel'

export default function RecentlyViewed({
    lessonsView,
}: {
    lessonsView: Array<{
        lesson_id: number
        viewed_at: string
        lesson_title: string
        lesson_description: string
        lesson_course_id: number
        lesson_image: string
        lesson_sequence: number
    }>
}) {
    return (
        <div className="p-4 flex flex-col gap-4 py-4 md:py-14">
            <div className="flex items-center py-4 gap-4">
                <Eye className="h-6 w-6" />
                <h3 className="text-xl font-semibold text-primary-500 dark:text-primary-400">
                        Recently Viewed Lessons
                </h3>
            </div>
            <div className="w-full max-w-xs sm:max-w-screen-sm md:max-w-screen-md lg:max-w-screen-2xl mx-auto px-4">
                <Carousel
                    opts={{
                        align: 'start',
                        loop: true,
                        breakpoints: {
                            '(min-width: 768px)': {
                                loop: false
                            }
                        }
                    }}
                    className="w-full p-2"
                >
                    <CarouselContent className="flex gap-4">
                        {lessonsView.map((lesson) => (
                            <CarouselItem
                                className="w-full sm:basis-1/2 lg:basis-1/3"
                                key={lesson.lesson_id}
                            >
                                <Card>
                                    <CardHeader>
                                        <CardTitle>
                                            {lesson.lesson_title}
                                        </CardTitle>
                                        <CardDescription>
                                                Lesson #{lesson.lesson_sequence}
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="flex flex-col gap-4">
                                        <p className="text-sm text-neutral-500 dark:text-neutral-400">
                                                Viewed on{' '}
                                            {dayjs(lesson.viewed_at).format(
                                                'MMMM D, YYYY h:mm A'
                                            )}
                                        </p>
                                        {lesson.lesson_image && (
                                            <Link
                                                href={`/dashboard/student/courses/${lesson.lesson_course_id}/lessons/${lesson.lesson_id}`}
                                            >
                                                <Image
                                                    src={lesson.lesson_image || '/img/placeholder.svg'}
                                                    alt={lesson.lesson_title}
                                                    width={600}
                                                    height={400}
                                                    className="rounded-lg w-full"
                                                    placeholder="blur"
                                                    layout="responsive"
                                                    blurDataURL="/img/placeholder.svg"
                                                />
                                            </Link>
                                        )}
                                        <p>{lesson.lesson_description}</p>
                                    </CardContent>
                                    <CardFooter>
                                        <Link
                                            className={buttonVariants({
                                                variant: 'link',
                                            })}
                                            href={`/dashboard/student/courses/${lesson.lesson_course_id}/lessons/${lesson.lesson_id}`}
                                        >
                                                Continue Reading
                                        </Link>
                                    </CardFooter>
                                </Card>
                            </CarouselItem>
                        ))}
                    </CarouselContent>
                    <CarouselPrevious />
                    <CarouselNext />
                </Carousel>
            </div>
        </div>
    )
}
