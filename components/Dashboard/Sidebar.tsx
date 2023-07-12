import Link from "next/link";

type ListDashboardProps = {
    NavItems?: React.ReactNode;
}

export default function Sidebar({ NavItems }: ListDashboardProps) {
    
    return (
        <aside
            id="sidebar"
            className="transition-width fixed left-0 top-0 z-20 flex hidden h-full w-64 flex-shrink-0 flex-col pt-16 duration-75 lg:flex"
            aria-label="Sidebar"
        >
            <div className="relative flex min-h-0 flex-1 flex-col border-r border-primary bg-base-200 pt-0">
                <div className="flex flex-1 flex-col overflow-y-auto pb-4 pt-5">
                    <div className="flex-1 bg-base-200 px-3 menu">
                        <ul className="menu bg-base-200 w-56 rounded-box">
                            {NavItems ? NavItems : null}
                        </ul>
                    </div>
                </div>
            </div>
        </aside>
    );
}


function ListDashboard({ icon, title }: any) {
    return (
        <li>
            <a
                href="#"
                className="group flex items-center rounded-lg p-2 text-base font-normal transition duration-75 hover:bg-secondary-content"
            >
                {/* <svg className="w-6 h-6 text-secod group-hover transition duration-75" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z"></path>
                <path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z"></path>
                </svg> */}
                {icon}
                <span className="text-secondary transition duration-75 focus:text-secondary-focus">
                    {title}
                </span>
            </a>
        </li>
    );
}
