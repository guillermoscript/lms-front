export default function LessonPage({
    children,
    sideBar,
}: {
    children: React.ReactNode;
    sideBar: React.ReactNode;
}) {
    return (
        <div className="flex flex-col gap-4 md:flex-row w-full">
            <div className="flex flex-col w-full md:w-3/4">{children}</div>
            <div className="flex-1 border-l w-full md:w-1/4">{sideBar}</div>
        </div>
    )
}
