'use client'

import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { Bell, ChevronRight, CreditCard, Eye, EyeOff, FileText, MessageSquare, Search, Settings, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { useScopedI18n } from '@/app/locales/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import { createClient } from '@/utils/supabase/client'

dayjs.extend(relativeTime)

const notificationTypes = [
    { value: 'all', label: 'allNotifications', icon: Bell },
    { value: 'comments', label: 'comments', icon: MessageSquare },
    { value: 'comment_reply', label: 'commentReplies', icon: MessageSquare },
    { value: 'exam_review', label: 'examReviews', icon: FileText },
    { value: 'order_renewal', label: 'orderRenewals', icon: CreditCard },
]

const getNotificationIcon = (type) => {
    switch (type) {
        case 'comments':
        case 'comment_reply':
            return <MessageSquare className="h-6 w-6 text-blue-500" />
        case 'exam_review':
            return <FileText className="h-6 w-6 text-green-500" />
        case 'order_renewal':
            return <CreditCard className="h-6 w-6 text-purple-500" />
        default:
            return <Bell className="h-6 w-6 text-gray-500" />
    }
}

export default function NotificationsPage() {
    const [notifications, setNotifications] = useState([])
    const [filteredNotifications, setFilteredNotifications] = useState([])
    const [searchTerm, setSearchTerm] = useState('')
    const [activeFilter, setActiveFilter] = useState('all')
    const router = useRouter()
    const supabase = createClient()

    const t = useScopedI18n('NotificationsPage')

    useEffect(() => {
        fetchNotifications()
    }, [])

    useEffect(() => {
        filterNotifications()
    }, [notifications, searchTerm, activeFilter])

    async function fetchNotifications() {
        const { data: userData } = await supabase.auth.getUser()
        if (!userData.user) {
            router.push('/login')
            return
        }

        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', userData.user.id)
            .order('created_at', { ascending: false })

        if (error) {
            console.error('Error fetching notifications:', error)
        } else {
            setNotifications(data)
        }
    }

    function filterNotifications() {
        let filtered = notifications

        if (searchTerm) {
            filtered = filtered.filter(notification =>
                notification.message.toLowerCase().includes(searchTerm.toLowerCase())
            )
        }

        if (activeFilter !== 'all') {
            filtered = filtered.filter(notification =>
                notification.notification_type === activeFilter
            )
        }

        setFilteredNotifications(filtered)
    }

    async function markAsRead(notification) {
        const { error } = await supabase
            .from('notifications')
            .update({ read: true })
            .eq('notification_id', notification.notification_id)

        if (error) {
            console.error('Error marking notification as read:', error)
        } else {
            setNotifications(notifications.map(n =>
                n.notification_id === notification.notification_id ? { ...n, read: true } : n
            ))
        }
    }

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">{t('title')}</h1>
                <Button variant="outline" size="icon">
                    <Settings className="h-4 w-4" />
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card className="md:col-span-1">
                    <CardHeader>
                        <CardTitle>{t('filters')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {notificationTypes.map((type) => (
                                <Button
                                    key={type.value}
                                    variant={activeFilter === type.value ? 'default' : 'outline'}
                                    className="w-full justify-start"
                                    onClick={() => setActiveFilter(type.value)}
                                >
                                    <type.icon className="mr-2 h-4 w-4" />
                                    {t(type.label)}
                                </Button>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <div className="md:col-span-3 space-y-6">
                    <Card>
                        <CardContent className="p-4">
                            <div className="relative">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder={t('searchPlaceholder')}
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-8 pr-8"
                                />
                                {searchTerm && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="absolute right-1 top-1"
                                        onClick={() => setSearchTerm('')}
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {filteredNotifications.map((notification) => (
                        <Card
                            key={notification.notification_id}
                            className={`transition-all duration-300 ${notification.read ? 'opacity-60' : 'shadow-md'}`}
                        >
                            <CardContent className="p-4">
                                <div className="flex items-start space-x-4">
                                    <div className="flex-shrink-0">
                                        {getNotificationIcon(notification.notification_type)}
                                    </div>
                                    <div className="flex-grow">
                                        <div className="flex justify-between items-start mb-2">
                                            <Badge variant={notification.read ? 'secondary' : 'default'}>
                                                {t(notification.notification_type.replace('_', ' '))}
                                            </Badge>
                                            <span className="text-sm text-muted-foreground">
                                                {dayjs(notification.created_at).fromNow()}
                                            </span>
                                        </div>
                                        <ViewMarkdown markdown={notification.message} />
                                        <div className="flex justify-between items-center mt-4">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-blue-500 hover:text-blue-700"
                                                onClick={() => { /* Navigate to related content */ }}
                                            >
                                                {t('viewDetails')}
                                                <ChevronRight className="ml-1 h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={async () => await markAsRead(notification)}
                                            >
                                                {notification.read ? (
                                                    <>
                                                        <EyeOff className="mr-2 h-4 w-4" />
                                                        {t('markAsUnread')}
                                                    </>
                                                ) : (
                                                    <>
                                                        <Eye className="mr-2 h-4 w-4" />
                                                        {t('markAsRead')}
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    )
}
