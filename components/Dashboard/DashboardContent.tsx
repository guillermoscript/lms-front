
type DashboardContentProps = {
    children: React.ReactNode;
}

export default function DashboardContent({ children }: DashboardContentProps) {
    return (
        
        <div className="p-4 md:p-8 lg:p-16 w-full">
            {children}
        </div>
    )
}