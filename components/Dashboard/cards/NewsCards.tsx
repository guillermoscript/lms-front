import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const NewsCard = () => {
    return (
        <Card>
            <CardHeader>
                <CardTitle>News</CardTitle>
                <CardDescription>Stay up-to-date with the latest news and updates.</CardDescription>
            </CardHeader>
            <CardContent>
                <NewsItem title="New Course: Introduction to React" description="Learn the fundamentals of React and build your first web application." />
                <NewsItem title="Upcoming Webinar: Mastering JavaScript" description="Join our expert instructor for an in-depth look at advanced JavaScript concepts." />
                <NewsItem title="New Feature: Personalized Learning Paths" description="Customize your learning experience with our new personalized learning paths." />
            </CardContent>
        </Card>
    )
}

const NewsItem = ({ title, description }: {
    title: string
    description: string
}) => {
    return (
        <div className="flex items-start gap-4">
            <img alt="News thumbnail" className="rounded-md" src="/placeholder.svg" style={{ aspectRatio: '64/64', objectFit: 'cover' }} width="64" height="64" />
            <div className="space-y-1">
                <h3 className="text-sm font-medium">{title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
            </div>
        </div>
    )
}

export default NewsCard
