export default function Sidebar() {
    return (
        <aside
            id="sidebar"
            className="transition-width fixed left-0 top-0 z-20 flex hidden h-full w-64 flex-shrink-0 flex-col pt-16 duration-75 lg:flex"
            aria-label="Sidebar"
        >
            <div className="relative flex min-h-0 flex-1 flex-col border-r border-primary bg-base-200 pt-0">
                <div className="flex flex-1 flex-col overflow-y-auto pb-4 pt-5">
                    <div className="flex-1 space-y-1 divide-y bg-base-200 px-3">
                        <ul className="space-y-2 pb-2">
                            <li>
                                <a
                                    href="#"
                                    className="group flex items-center rounded-lg p-2 text-base font-normal transition duration-75 hover:bg-secondary-content"
                                >
                                    {/* <svg className="w-6 h-6 text-secod group-hover transition duration-75" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                             <path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z"></path>
                             <path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z"></path>
                          </svg> */}
                                    <span className="text-secondary transition duration-75 focus:text-secondary-focus">
                                        Dashboard
                                    </span>
                                </a>
                            </li>
                            <li>
                                <a
                                    href="#"
                                    target="_blank"
                                    className="group flex items-center rounded-lg p-2 text-base font-normal hover:bg-gray-100 "
                                >
                                    <svg
                                        className="group-hover h-6 w-6 flex-shrink-0 text-gray-500 transition duration-75"
                                        fill="currentColor"
                                        viewBox="0 0 20 20"
                                        xmlns="http://www.w3.org/2000/svg"
                                    >
                                        <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path>
                                    </svg>
                                    <span className="ml-3 flex-1 whitespace-nowrap">
                                        Kanban
                                    </span>
                                    <span className="ml-3 inline-flex items-center justify-center rounded-full bg-gray-200 px-2 text-sm font-medium text-gray-800">
                                        Pro
                                    </span>
                                </a>
                            </li>
                        </ul>

                        <div className="space-y-2 pt-2 border-primary">
                            <a
                                href="#"
                                className="group flex items-center rounded-lg p-2 text-base font-normal transition duration-75 hover:bg-gray-100"
                            >
                                <svg
                                    className="group-hover h-5 w-5 flex-shrink-0 text-gray-500 transition duration-75"
                                    aria-hidden="true"
                                    focusable="false"
                                    data-prefix="fas"
                                    data-icon="gem"
                                    role="img"
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 512 512"
                                >
                                    <path
                                        fill="currentColor"
                                        d="M378.7 32H133.3L256 182.7L378.7 32zM512 192l-107.4-141.3L289.6 192H512zM107.4 50.67L0 192h222.4L107.4 50.67zM244.3 474.9C247.3 478.2 251.6 480 256 480s8.653-1.828 11.67-5.062L510.6 224H1.365L244.3 474.9z"
                                    ></path>
                                </svg>
                                <span className="ml-4">Upgrade to Pro</span>
                            </a>
                            <a
                                href="#"
                                target="_blank"
                                className="group flex items-center rounded-lg p-2 text-base font-normal transition duration-75 hover:bg-gray-100"
                            >
                                <svg
                                    className="group-hover h-6 w-6 flex-shrink-0 text-gray-500 transition duration-75"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"></path>
                                    <path
                                        fill-rule="evenodd"
                                        d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z"
                                        clipRule-rule="evenodd"
                                    ></path>
                                </svg>
                                <span className="ml-3">Documentation</span>
                            </a>
                            <a
                                href="#"
                                target="_blank"
                                className="group flex items-center rounded-lg p-2 text-base font-normal transition duration-75 hover:bg-gray-100"
                            >
                                <svg
                                    className="group-hover h-6 w-6 flex-shrink-0 text-gray-500 transition duration-75"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z"></path>
                                </svg>
                                <span className="ml-3">Components</span>
                            </a>
                            <a
                                href="#"
                                target="_blank"
                                className="group flex items-center rounded-lg p-2 text-base font-normal transition duration-75 hover:bg-gray-100"
                            >
                                <svg
                                    className="group-hover h-6 w-6 flex-shrink-0 text-gray-500 transition duration-75"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path
                                        fill-rule="evenodd"
                                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-2 0c0 .993-.241 1.929-.668 2.754l-1.524-1.525a3.997 3.997 0 00.078-2.183l1.562-1.562C15.802 8.249 16 9.1 16 10zm-5.165 3.913l1.58 1.58A5.98 5.98 0 0110 16a5.976 5.976 0 01-2.516-.552l1.562-1.562a4.006 4.006 0 001.789.027zm-4.677-2.796a4.002 4.002 0 01-.041-2.08l-.08.08-1.53-1.533A5.98 5.98 0 004 10c0 .954.223 1.856.619 2.657l1.54-1.54zm1.088-6.45A5.974 5.974 0 0110 4c.954 0 1.856.223 2.657.619l-1.54 1.54a4.002 4.002 0 00-2.346.033L7.246 4.668zM12 10a2 2 0 11-4 0 2 2 0 014 0z"
                                        clipRule-rule="evenodd"
                                    ></path>
                                </svg>
                                <span className="ml-3">Help</span>
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </aside>
    );
}

type ListDashboardProps = {
    icon: React.ReactNode;
    title: string;
};

function ListDashboard({ icon, title }: ListDashboardProps) {
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
