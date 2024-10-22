'use client'

import { motion } from 'framer-motion'
import {
    Book,
    Calendar,
    Edit,
    GraduationCap,
    Mail,
    Phone,
    User,
} from 'lucide-react'
import Link from 'next/link'

import { useScopedI18n } from '@/app/locales/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface TeacherData {
    name: string
    email: string
    phone: string
    avatar: string
    // subject: string
    // totalStudents: number
    // totalClasses: number
    // rating: number
    // upcomingClasses: Array<{
    //     id: string
    //     title: string
    //     date: string
    //     time: string
    //     students: number
    // }>
    // recentActivity: Array<{
    //     id: string
    //     action: string
    //     date: string
    // }>
}

const teacherData: TeacherData = {
    name: 'Sarah Johnson',
    email: 'sarah.johnson@example.com',
    phone: '+1 (555) 123-4567',
    avatar: '/placeholder.svg?height=100&width=100',
    // subject: 'Mathematics',
    // totalStudents: 120,
    // totalClasses: 45,
    // rating: 4.8,
    // upcomingClasses: [
    //     { id: '1', title: 'Advanced Calculus', date: '2024-03-15', time: '10:00 AM', students: 25 },
    //     { id: '2', title: 'Geometry Basics', date: '2024-03-16', time: '2:00 PM', students: 30 },
    //     { id: '3', title: 'Algebra II', date: '2024-03-17', time: '11:00 AM', students: 28 },
    // ],
    // recentActivity: [
    //     { id: '1', action: 'Graded Calculus Quiz', date: '2024-03-14' },
    //     { id: '2', action: 'Updated Geometry syllabus', date: '2024-03-13' },
    //     { id: '3', action: 'Conducted online office hours', date: '2024-03-12' },
    // ],
}

export default function TeacherAccountPage({
    teacherData,
}: {
    teacherData: TeacherData
}) {
    const t = useScopedI18n('TeacherAccountPage')

    return (
        <div className="container mx-auto px-4 py-8">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                <Card className="mb-8">
                    <CardContent className="p-6">
                        <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
                            <Avatar className="w-24 h-24">
                                <AvatarImage
                                    src={teacherData.avatar}
                                    alt={teacherData.name}
                                />
                                <AvatarFallback>
                                    {teacherData.name
                                        .split(' ')
                                        .map((n) => n[0])
                                        .join('')}
                                </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 text-center md:text-left">
                                <h1 className="text-3xl font-bold mb-2">
                                    {teacherData.name}
                                </h1>
                                <div className="flex flex-wrap justify-center md:justify-start gap-4">
                                    <Badge
                                        variant="secondary"
                                        className="flex items-center gap-1"
                                    >
                                        <Mail className="w-3 h-3" />
                                        {teacherData.email}
                                    </Badge>
                                    <Badge
                                        variant="secondary"
                                        className="flex items-center gap-1"
                                    >
                                        <Phone className="w-3 h-3" />
                                        {teacherData.phone}
                                    </Badge>
                                </div>
                            </div>
                            <Link
                                href="/dashboard/teacher/account/edit"
                                className={buttonVariants({ variant: 'default' })}
                            >
                                <Edit className="w-4 h-4 mr-2" />
                                {t('editProfile')}
                            </Link>
                        </div>
                    </CardContent>
                </Card>

                <Tabs defaultValue="overview" className="space-y-4">
                    <TabsList className="grid w-full grid-cols-3 lg:w-[400px]">
                        <TabsTrigger value="overview">{t('overview')}</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">
                                        {t('totalStudents')}
                                    </CardTitle>
                                    <User className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                            </Card>
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">
                                        {t('totalClasses')}
                                    </CardTitle>
                                    <Book className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                            </Card>
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">
                                        {t('averageRating')}
                                    </CardTitle>
                                    <GraduationCap className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                            </Card>
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">
                                        {t('nextClass')}
                                    </CardTitle>
                                    <Calendar className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                            </Card>
                        </div>

                    </TabsContent>

                </Tabs>
            </motion.div>
        </div>
    )
}
