import DashboardLayout from '@/components/dashboards/Common/DashboardLayout'

export default function Component ({ children }: { children: React.ReactNode }) {
    return (
        <DashboardLayout>
            {children}
        </DashboardLayout>
    )
}
