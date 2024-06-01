function ExamHeader ({
    title,
    description,
    timeRemaining,
    dueDate
}: {
    title: string
    description: string
    timeRemaining: string
    dueDate: string
}) {
    return (
        <div>
            <h1 className="text-3xl font-bold">{title}</h1>
            <p className="text-gray-500 dark:text-gray-400">{description}</p>
            <div className="mt-4 flex items-center gap-4">
                {/* Time Remaining and Due Date components can go here */}
            </div>
        </div>
    )
}

export default ExamHeader
