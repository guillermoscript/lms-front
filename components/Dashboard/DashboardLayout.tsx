import DashboardContent from "./DashboardContent";
import DashboardFooter from "./DashboardFooter";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

type DashboardLayoutProps = {
    children: React.ReactNode;
}

export default function DashboardLayout( { children }: DashboardLayoutProps ) {
    
    return (
        <div className="flex flex-wrap">
            <Topbar />
            <Sidebar />
            <div id="main-content" className="h-full w-full bg-base-100 md:ml-64 relative overflow-y-auto ">
                <DashboardContent>
                    {children}
                </DashboardContent>
                <DashboardFooter />
            </div>
        </div>
    )
}