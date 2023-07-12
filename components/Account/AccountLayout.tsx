import { User } from "../../payload-types";
import DashboardLayout from "../Dashboard/DashboardLayout";
import AccountHeader from "./AccountHeader";
import AccountMenu from "./AccountMenu";
import AccountNavBar from "./AccountNavBar";

type AccountLayoutProps = {
    children: React.ReactNode;
    user: User;
};

export default function AccountLayout({ children, user }: AccountLayoutProps) {

    if (!user) {
        return (
            <DashboardLayout>
                <div className="flex justify-center items-center h-screen">
                    <p className="text-2xl text-blueGray-400">Loading...</p>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout
            NavItems={<AccountNavBar />}
        >
            <AccountHeader user={user} />
            <AccountMenu />
            {children}
        </DashboardLayout>
    );
}