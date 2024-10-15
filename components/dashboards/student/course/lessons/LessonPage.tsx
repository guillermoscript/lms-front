export default function LessonPage({
    children,
    sideBar,
}: {
    children: React.ReactNode;
    sideBar: React.ReactNode;
}) {
    return (
        <div className="flex flex-col gap-4 md:flex-row w-full">
            <div className="flex flex-col w-full md:w-4/6">
                {children}
            </div>
            <div className="flex-1 lg:border-l border-t lg:border-t-0 py-8 lg:py-0 w-full md:w-2/6">
                {sideBar}
            </div>
        </div>
    )
}
