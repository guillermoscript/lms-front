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
                                    {/* <Badge variant="secondary" className="flex items-center gap-1">
                                        <GraduationCap className="w-3 h-3" />
                                        {teacherData.totalStudents} Students
                                    </Badge>
                                    <Badge variant="secondary" className="flex items-center gap-1">
                                        <Book className="w-3 h-3" />
                                        {teacherData.totalClasses} Classes
                                    </Badge> */}
                                </div>
                            </div>
                            <Link
                                href="/dashboard/teacher/account/edit"
                                className={buttonVariants({ variant: 'default' })}
                            >
                                <Edit className="w-4 h-4 mr-2" />
                                Edit Profile
                            </Link>
                        </div>
                    </CardContent>
                </Card>

                <Tabs defaultValue="overview" className="space-y-4">
                    <TabsList className="grid w-full grid-cols-3 lg:w-[400px]">
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        {/* <TabsTrigger value="classes">Classes</TabsTrigger>
                        <TabsTrigger value="activity">Activity</TabsTrigger> */}
                    </TabsList>

                    <TabsContent value="overview" className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">
                                        Total Students
                                    </CardTitle>
                                    <User className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                                {/* <CardContent>
                                    <div className="text-2xl font-bold">{teacherData.totalStudents}</div>
                                    <p className="text-xs text-muted-foreground">+2% from last month</p>
                                </CardContent> */}
                            </Card>
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">
                                        Total Classes
                                    </CardTitle>
                                    <Book className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                                {/* <CardContent>
                                    <div className="text-2xl font-bold">{teacherData.totalClasses}</div>
                                    <p className="text-xs text-muted-foreground">+5% from last month</p>
                                </CardContent> */}
                            </Card>
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">
                                        Average Rating
                                    </CardTitle>
                                    <GraduationCap className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                                {/* <CardContent>
                                    <div className="text-2xl font-bold">{teacherData.rating}/5.0</div>
                                    <Progress value={teacherData.rating * 20} className="mt-2" />
                                </CardContent> */}
                            </Card>
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">
                                        Next Class
                                    </CardTitle>
                                    <Calendar className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                                {/* <CardContent>
                                    <div className="text-2xl font-bold">{teacherData.upcomingClasses[0].title}</div>
                                    <p className="text-xs text-muted-foreground">{teacherData.upcomingClasses[0].date} at {teacherData.upcomingClasses[0].time}</p>
                                </CardContent> */}
                            </Card>
                        </div>

                        {/* <Card>
                            <CardHeader>
                                <CardTitle>Recent Activity</CardTitle>
                                <CardDescription>
                                    Your latest actions and updates
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ul className="space-y-4">
                                    {teacherData.recentActivity.map(
                                        (activity) => (
                                            <li
                                                key={activity.id}
                                                className="flex items-center"
                                            >
                                                <div className="mr-4 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                                                    <Clock className="h-5 w-5 text-primary" />
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-sm font-medium">
                                                        {activity.action}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {activity.date}
                                                    </p>
                                                </div>
                                            </li>
                                        )
                                    )}
                                </ul>
                            </CardContent>
                            <CardFooter>
                                <Button variant="outline" className="w-full">
                                    View All Activity
                                </Button>
                            </CardFooter>
                        </Card> */}
                    </TabsContent>

                    {/* <TabsContent value="classes" className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Upcoming Classes</CardTitle>
                                <CardDescription>Your scheduled classes for the next few days</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ul className="space-y-4">
                                    {teacherData.upcomingClasses.map((class_) => (
                                        <li key={class_.id} className="flex items-center justify-between">
                                            <div>
                                                <p className="font-medium">{class_.title}</p>
                                                <p className="text-sm text-muted-foreground">{class_.date} at {class_.time}</p>
                                            </div>
                                            <Badge>{class_.students} students</Badge>
                                        </li>
                                    ))}
                                </ul>
                            </CardContent>
                            <CardFooter>
                                <Button variant="outline" className="w-full">View Full Schedule</Button>
                            </CardFooter>
                        </Card>
                    </TabsContent>

                    <TabsContent value="activity" className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Recent Activity</CardTitle>
                                <CardDescription>Your latest actions and updates</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ul className="space-y-4">
                                    {teacherData.recentActivity.map((activity) => (
                                        <li key={activity.id} className="flex items-center">
                                            <div className="mr-4 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                                                <Clock className="h-5 w-5 text-primary" />
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-sm font-medium">{activity.action}</p>
                                                <p className="text-xs text-muted-foreground">{activity.date}</p>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </CardContent>
                            <CardFooter>
                                <Button variant="outline" className="w-full">View All Activity</Button>
                            </CardFooter>
                        </Card>
                    </TabsContent> */}
                </Tabs>
            </motion.div>
        </div>
    )
}
