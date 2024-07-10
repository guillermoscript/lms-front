import DashboardLayout from '@/components/dashboards/Common/DashboardLayout'
export const metadata = {
    title: 'Dashboard Layout',
    description: 'Dashboard layout for student'
}
export default function Component ({ children }: { children: React.ReactNode }) {
    return (
        <DashboardLayout>
            {children}
        </DashboardLayout>
    )
}
