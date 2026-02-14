import { TemplateForm } from '@/components/teacher/template-form'
import { IconArrowLeft } from '@tabler/icons-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function NewTemplatePage() {
  return (
    <div className="flex-1 space-y-8 p-8 pt-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/teacher/templates">
          <Button variant="ghost" size="icon">
            <IconArrowLeft size={20} />
          </Button>
        </Link>
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Create Template</h2>
          <p className="text-muted-foreground">
            Design a new reusable AI prompt template.
          </p>
        </div>
      </div>

      <TemplateForm />
    </div>
  )
}
