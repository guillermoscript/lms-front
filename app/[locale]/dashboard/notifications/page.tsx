import NotificationsPageComponent from '@/components/dashboards/notifications/notifications-page'

export default async function NotificationsPage ({ searchParams }: {
    searchParams?: {
        filter?: string
    }
}) {
    return (
        <>
            <NotificationsPageComponent />
        </>
    )
}
