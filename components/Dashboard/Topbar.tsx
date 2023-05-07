import ThemeSwitch from "../Inputs/ThemeSwitch";

export default function Topbar() {
    return (
        <nav className="fixed z-30 w-full border-b border-primary bg-base-200 h-16">
            <div className="px-3 py-3 lg:px-5 lg:pl-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center justify-start">
                        <button
                            id="toggleSidebarMobile"
                            aria-expanded="true"
                            aria-controls="sidebar"
                            className="mr-2 cursor-pointer rounded p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:bg-gray-100 focus:ring-2 focus:ring-gray-100 lg:hidden"
                        >
                            <svg
                                id="toggleSidebarMobileHamburger"
                                className="h-6 w-6"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <path
                                    fill-rule="evenodd"
                                    d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                                    clipRule-rule="evenodd"
                                ></path>
                            </svg>
                            <svg
                                id="toggleSidebarMobileClose"
                                className="hidden h-6 w-6"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <path
                                    fill-rule="evenodd"
                                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                    clipRule-rule="evenodd"
                                ></path>
                            </svg>
                        </button>
                        <a
                            href="#"
                            className="flex items-center text-xl font-bold lg:ml-2.5"
                        >
                            {/* <img src="https://demo.themesberg.com/windster/images/logo.svg" className="h-6 mr-2" alt="Windster Logo"> */}
                            <span className="self-center whitespace-nowrap">
                                LMS Dashboard
                            </span>
                        </a>
                        {/* <form action="#" method="GET" className="hidden lg:block lg:pl-32">
					<label className="sr-only">Search</label>
					<div className="mt-1 relative lg:w-64">
					   <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
						  <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
							 <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule-rule="evenodd"></path>
						  </svg>
					   </div>
					   <input type="text" name="email" id="topbar-search" className="bg-gray-50 border border-gray-300 text-gray-900 sm:text-sm rounded-lg focus:ring-cyan-600 focus:border-cyan-600 block w-full pl-10 p-2.5" placeholder="Search" />
					</div>
				 </form> */}
                    </div>
                    <div className="flex items-center">
                        <button
                            id="toggleSidebarMobileSearch"
                            type="button"
                            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 lg:hidden"
                        >
                            <span className="sr-only">Search</span>
                            <svg
                                className="h-6 w-6"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <path
                                    fill-rule="evenodd"
                                    d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
                                    clipRule-rule="evenodd"
                                ></path>
                            </svg>
                        </button>
                        <ThemeSwitch />
                        <a
                            href="#"
                            className="ml-5 mr-3 hidden items-center rounded-lg bg-accent-content px-5 py-2.5 text-center text-sm font-medium text-accent focus:ring-4 focus:text-accent-focus focus:ring-accent-focus sm:inline-flex"
                        >
                            Upgrade to Pro
                        </a>
                    </div>
                </div>
            </div>
        </nav>
    );
}
