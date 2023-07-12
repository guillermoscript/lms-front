import DashboardContent from "./DashboardContent";
import DashboardFooter from "./DashboardFooter";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

type DashboardLayoutProps = {
    children: React.ReactNode;
    NavItems?: React.ReactNode | null;
}

export default function DashboardLayout( { children, NavItems }: DashboardLayoutProps ) {
    
    return (
        <div className="flex flex-wrap">
            <Topbar />
            {
                NavItems ? <Sidebar NavItems={NavItems} /> : <Sidebar />
            }
            <div id="main-content" className="h-full w-full bg-base-100 md:ml-64 relative overflow-y-auto md:py-8 ">
                <DashboardContent>
                    {children}
                </DashboardContent>
                <DashboardFooter />
            </div>
        </div>
    )
}