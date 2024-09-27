import {
    BarChart2,
    Book,
    CheckCircle,
    Clock,
    MessageCircle,
    PlusCircle,
    TrendingUp,
    Users,
} from 'lucide-react'
import Link from 'next/link'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
    Table,
    TableBody,
    TableCell,
    TableRow,
} from '@/components/ui/table'

const InsightCard = ({ title, value, change, icon: Icon, trend }) => (
    <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
                {title}
            </CardTitle>
            <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
            <div className="text-2xl font-bold">{value}</div>
            <p className={`text-xs ${trend === 'up' ? 'text-green-500' : 'text-red-500'} flex items-center`}>
                {trend === 'up' ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingUp className="h-3 w-3 mr-1 transform rotate-180" />}
                {change}
            </p>
        </CardContent>
    </Card>
)
const TopPerformingStudents = () => (
    <Card>
        <CardHeader>
            <CardTitle>Top Performing Students</CardTitle>
        </CardHeader>
        <CardContent>
            <Table>
                <TableBody>
                    {[
                        { name: 'Alice Johnson', course: 'Web Development', progress: 95 },
                        { name: 'Bob Smith', course: 'Mobile App Design', progress: 92 },
                        { name: 'Charlie Brown', course: 'Data Structures', progress: 88 },
                    ].map((student, index) => (
                        <TableRow key={index}>
                            <TableCell className="font-medium">{student.name}</TableCell>
                            <TableCell>{student.course}</TableCell>
                            <TableCell>
                                <Progress value={student.progress} className="w-[60px]" />
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </CardContent>
    </Card>
)

const RecentMessages = () => (
    <Card>
        <CardHeader>
            <CardTitle>Recent Messages</CardTitle>
        </CardHeader>
        <CardContent>
            <div className="space-y-4">
                {[
                    { name: 'Emma Watson', message: 'Question about the latest assignment', time: '10m ago' },
                    { name: 'Liam Neeson', message: 'Feedback on my project submission', time: '1h ago' },
                    { name: 'Olivia Wilde', message: 'Request for extension on deadline', time: '3h ago' },
                ].map((msg, index) => (
                    <div key={index} className="flex items-center space-x-4">
                        <Avatar>
                            <AvatarImage src={`https://i.pravatar.cc/40?img=${index}`} alt={msg.name} />
                            <AvatarFallback>{msg.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 space-y-1">
                            <p className="text-sm font-medium leading-none">{msg.name}</p>
                            <p className="text-sm text-muted-foreground">{msg.message}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">{msg.time}</p>
                    </div>
                ))}
            </div>
        </CardContent>
    </Card>
)

const UpcomingDeadlines = () => (
    <Card>
        <CardHeader>
            <CardTitle>Upcoming Deadlines</CardTitle>
        </CardHeader>
        <CardContent>
            <div className="space-y-4">
                {[
                    { course: 'Web Development', task: 'Project Submission', date: 'May 20, 2024' },
                    { course: 'Data Structures', task: 'Mid-term Exam', date: 'May 25, 2024' },
                    { course: 'UI/UX Design', task: 'Portfolio Review', date: 'June 1, 2024' },
                ].map((deadline, index) => (
                    <div key={index} className="flex items-center space-x-4">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <div className="flex-1 space-y-1">
                            <p className="text-sm font-medium leading-none">{deadline.course}</p>
                            <p className="text-sm text-muted-foreground">{deadline.task}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">{deadline.date}</p>
                    </div>
                ))}
            </div>
        </CardContent>
    </Card>
)

export default function EnhancedTeacherDashboard() {
    return (
        <div className="p-8 min-h-screen">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold">Teacher Dashboard</h1>

            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
                <InsightCard title="Total Students" value="1,234" change="+5.2% from last month" icon={Users} trend="up" />
                <InsightCard title="Course Completion Rate" value="78%" change="+2.1% from last month" icon={CheckCircle} trend="up" />
                <InsightCard title="Average Engagement" value="85%" change="-0.5% from last month" icon={BarChart2} trend="down" />
                <InsightCard title="Active Courses" value="15" change="+2 from last month" icon={Book} trend="up" />
            </div>

            <div className='flex flex-col gap-8'>

                <Card>
                    <CardHeader>
                        <CardTitle>Quick Actions</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-4">
                        <Link
                            href="/dashboard/teacher/courses"
                            className={buttonVariants({ variant: 'default' })}
                        >
                            <PlusCircle className="mr-2 h-4 w-4" /> View Courses
                        </Link>
                        <Link
                            href="/dashboard/teacher/lesson"
                            className={buttonVariants({ variant: 'default' })}
                        >
                            <MessageCircle className="mr-2 h-4 w-4" /> Send Announcement
                        </Link>
                    </CardContent>
                </Card>

                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-8">
                    <TopPerformingStudents />
                    <RecentMessages />
                    <UpcomingDeadlines />
                </div>
            </div>
        </div>
    )
}
