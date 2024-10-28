'use client'
import { motion } from 'framer-motion'
import { Info } from 'lucide-react'
import Image from 'next/image'

import { useScopedI18n } from '@/app/locales/client'
import { Badge } from '@/components/ui/badge'
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'

import EnrollButton from './EnrollButton'

interface NotEnrolledMessageProps {
    courseName: string
    courseDescription: string
    courseId: number
    courseThumbnail?: string
}

export default function NotEnrolledMessage({
    courseName,
    courseDescription,
    courseId,
    courseThumbnail,
}: NotEnrolledMessageProps) {
    const t = useScopedI18n('NotEnrolledMessage')
    
    return (
        <div className="container mx-auto px-4 py-8">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                <Card className="max-w-2xl mx-auto">
                    <CardHeader className="text-center">
                        <Badge variant="secondary" className="mb-2 inline-flex">
                            <Info className="mr-1 h-3 w-3" />
                            {t('courseAccess')}
                        </Badge>
                        <CardTitle className="text-2xl font-bold">
                            {t('notEnrolledIn')} "{courseName}"
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-center">
                        {courseThumbnail && (
                            <Image
                                src={courseThumbnail}
                                alt=""
                                width={200}
                                height={200}
                                className="mx-auto mb-4 rounded-lg"
                            />
                        )}
                        <p className="text-muted-foreground mb-4">
                            {t('enrollPrompt')}
                        </p>
                        <div className="bg-secondary/20 p-4 rounded-lg mb-4">
                            <h3 className="font-semibold mb-2">
                                {t('aboutThisCourse')}
                            </h3>
                            <p className="text-sm">{courseDescription}</p>
                        </div>
                    </CardContent>
                    <CardFooter className="flex justify-center">
                        <EnrollButton courseId={courseId} />
                    </CardFooter>
                </Card>
            </motion.div>
        </div>
    )
}
