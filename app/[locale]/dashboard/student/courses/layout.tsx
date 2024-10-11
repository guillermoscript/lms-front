
export const metadata = {
    title: 'Courses Layout',
    description: 'Layout for courses'
}

export default async function CoursesLayout ({
    children
}: {
    children: React.ReactNode
}) {
    return <>{children}</>
}
