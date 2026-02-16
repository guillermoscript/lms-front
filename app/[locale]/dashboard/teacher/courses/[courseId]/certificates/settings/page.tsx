import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Button } from '@/components/ui/button'
import { IconArrowLeft } from '@tabler/icons-react'
import { CertificateTemplateForm } from '@/components/teacher/certificate-template-form'

interface PageProps {
    params: Promise<{ courseId: string }>
}

export default async function CertificateSettingsPage({ params }: PageProps) {
    const { courseId } = await params
    const supabase = await createClient()
    const t = await getTranslations('dashboard.teacher.manageCourse')

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect('/auth/login')
    }

    // Get course and verify ownership
    const { data: course, error: courseError } = await supabase
        .from('courses')
        .select('*')
        .eq('course_id', parseInt(courseId))
        .single()

    if (courseError || !course) {
        notFound()
    }

    if (course.author_id !== user.id) {
        redirect(`/dashboard/teacher/courses/${courseId}`)
    }

    // Get existing template
    const { data: template } = await supabase
        .from('certificate_templates')
        .select('*')
        .eq('course_id', parseInt(courseId))
        .single()

    return (
        <div className="min-h-screen bg-background pb-20">
            <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
                <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
                    <div className="flex items-center gap-4">
                        <Link href={`/dashboard/teacher/courses/${courseId}`}>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                <IconArrowLeft className="h-4 w-4" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">{t('certificates.title')}</h1>
                            <p className="text-sm text-muted-foreground">{course.title}</p>
                        </div>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
                <CertificateTemplateForm
                    courseId={parseInt(courseId)}
                    initialData={template}
                />
            </main>
        </div>
    )
}
