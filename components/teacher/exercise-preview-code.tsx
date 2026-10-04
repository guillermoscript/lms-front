'use client'

import { SandpackProvider, SandpackLayout, SandpackCodeEditor, SandpackPreview, useSandpack } from '@codesandbox/sandpack-react'
import { Button } from '@/components/ui/button'
import { useTranslations } from 'next-intl'

interface Props {
  files: Record<string, string>
  activeFile?: string | null
  visibleFiles?: string[] | null
  busy: boolean
  onEvaluate: (content: string) => void
}

function CodeSubmit({ busy, onEvaluate }: Pick<Props, 'busy' | 'onEvaluate'>) {
  const { sandpack } = useSandpack()
  const t = useTranslations('dashboard.teacher.exercisePreview')
  return <Button type="button" disabled={busy} onClick={() => onEvaluate(
    Object.entries(sandpack.files).map(([path, file]) => `// ── ${path} ──\n${file.code}`).join('\n\n')
  )}>{busy ? t('evaluating') : t('evaluate')}</Button>
}

/** The same React sandbox and file serialization as student code, without autosave. */
export default function ExercisePreviewCode({ files, activeFile, visibleFiles, ...submission }: Props) {
  return (
    <SandpackProvider theme="dark" template="react" files={files} options={{ activeFile: activeFile || undefined, visibleFiles: visibleFiles || undefined }}>
      <div className="flex flex-col gap-4">
        <SandpackLayout>
          <SandpackCodeEditor showTabs showLineNumbers />
          <SandpackPreview showNavigator={false} showRefreshButton />
        </SandpackLayout>
        <CodeSubmit {...submission} />
      </div>
    </SandpackProvider>
  )
}
