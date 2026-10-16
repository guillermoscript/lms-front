'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { ImprovedTemplateSelector, type PromptTemplate } from '../improved-template-selector'
import { AIPreviewModal } from '../ai-preview-modal'

type ApplyData = Parameters<React.ComponentProps<typeof ImprovedTemplateSelector>['onApply']>[0]
type PreviewConfig = React.ComponentProps<typeof AIPreviewModal>['config']

/**
 * Built-in (i18n) evaluation templates for an AI-evaluated exercise step.
 * Reads `dashboard.teacher.exerciseBuilder.<namespaceKey>.<kind>.{name,description,instructions,criteria,scenario?}`.
 * Ids are negative (`idOffset - index`) so they never clash with DB rows; give each step its own offset.
 */
export function useBuiltInTemplates(
  namespaceKey: string,
  kinds: readonly string[],
  variables: string[],
  idOffset: number,
  opts: { scenario?: boolean } = {},
): PromptTemplate[] {
  const t = useTranslations('dashboard.teacher.exerciseBuilder')
  // `t.raw`: the bodies carry literal `{{variable}}` placeholders that the template
  // selector substitutes itself; ICU formatting would treat them as a syntax error.
  const raw = (key: string) => String(t.raw(key))
  const kindsKey = kinds.join(',')
  const variablesKey = variables.join(',')
  return useMemo(
    () =>
      kindsKey.split(',').map((kind, index) => ({
        id: idOffset - index,
        name: raw(`${namespaceKey}.${kind}.name`),
        description: raw(`${namespaceKey}.${kind}.description`),
        category: 'exercise',
        task_description_template: raw(`${namespaceKey}.${kind}.instructions`),
        system_prompt_template: raw(`${namespaceKey}.${kind}.criteria`),
        ...(opts.scenario ? { scenario_template: raw(`${namespaceKey}.${kind}.scenario`) } : {}),
        variables: { variables: variablesKey.split(',') },
        is_system: true,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `raw` only wraps `t`
    [t, namespaceKey, kindsKey, variablesKey, idOffset, opts.scenario],
  )
}

interface AIEvalTemplateBarProps {
  builtIns?: PromptTemplate[]
  onApply: (data: ApplyData) => void
  /** Omit when the AI preview cannot exercise this step's evaluation (e.g. audio/video/voice). */
  previewConfig?: PreviewConfig
}

/** The standard "templates + AI preview" bar every AI-evaluated exercise step shows. */
export function AIEvalTemplateBar({ builtIns, onApply, previewConfig }: AIEvalTemplateBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-muted-foreground/20 bg-muted/20 p-4">
      <ImprovedTemplateSelector category="exercise" additionalTemplates={builtIns} onApply={onApply} />
      {previewConfig && <AIPreviewModal type="exercise" config={previewConfig} />}
    </div>
  )
}
