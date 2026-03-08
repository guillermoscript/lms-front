'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { IconSparkles, IconInfoCircle, IconDeviceFloppy } from '@tabler/icons-react'
import { updateExamAIConfig, getAIConfigOptions } from '@/app/actions/exam-grading'
import { toast } from 'sonner'

interface ExamAIConfigProps {
  examId: number
  initialConfig?: {
    aiGradingEnabled: boolean
    aiGradingPrompt?: string
    aiPersona?: string
    aiFeedbackTone?: string
    aiFeedbackDetailLevel?: string
  }
}

export function ExamAIConfig({ examId, initialConfig }: ExamAIConfigProps) {
  const [aiEnabled, setAiEnabled] = useState(initialConfig?.aiGradingEnabled ?? true)
  const [customPrompt, setCustomPrompt] = useState(initialConfig?.aiGradingPrompt ?? '')
  const [persona, setPersona] = useState(initialConfig?.aiPersona ?? 'professional_educator')
  const [tone, setTone] = useState(initialConfig?.aiFeedbackTone ?? 'encouraging')
  const [detailLevel, setDetailLevel] = useState(
    initialConfig?.aiFeedbackDetailLevel ?? 'detailed'
  )
  const [isSaving, setIsSaving] = useState(false)
  const [configOptions, setConfigOptions] = useState<Awaited<ReturnType<typeof getAIConfigOptions>> | null>(null)

  useEffect(() => {
    getAIConfigOptions().then(setConfigOptions)
  }, [])

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const result = await updateExamAIConfig({
        examId,
        aiGradingEnabled: aiEnabled,
        aiGradingPrompt: customPrompt || undefined,
        aiPersona: persona as any,
        aiFeedbackTone: tone as any,
        aiFeedbackDetailLevel: detailLevel as any,
      })

      if (result.success) {
        toast.success('AI grading configuration saved successfully')
      } else {
        toast.error(result.error || 'Failed to save configuration')
      }
    } catch (error) {
      toast.error('An unexpected error occurred')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <IconSparkles className="h-5 w-5 text-primary" />
          <div>
            <CardTitle>AI Grading Configuration</CardTitle>
            <CardDescription>
              Customize how AI evaluates and provides feedback on student submissions
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable/Disable AI Grading */}
        <div className="flex items-center justify-between space-x-2">
          <div className="space-y-0.5">
            <Label htmlFor="ai-enabled">Enable AI Grading</Label>
            <p className="text-sm text-muted-foreground">
              Automatically grade submissions using AI
            </p>
          </div>
          <Switch id="ai-enabled" checked={aiEnabled} onCheckedChange={setAiEnabled} />
        </div>

        {aiEnabled && configOptions && (
          <>
            {/* AI Persona Selection */}
            <div className="space-y-2">
              <Label htmlFor="persona">AI Persona</Label>
              <Select value={persona} onValueChange={(v) => setPersona(v || 'balanced')}>
                <SelectTrigger id="persona">
                  <SelectValue placeholder="Select AI persona" />
                </SelectTrigger>
                <SelectContent>
                  {configOptions.personas.map((option: any) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex flex-col">
                        <span className="font-medium">{option.label}</span>
                        <span className="text-xs text-muted-foreground">{option.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                {configOptions.personas.find((p: any) => p.value === persona)?.description}
              </p>
            </div>

            {/* Feedback Tone */}
            <div className="space-y-2">
              <Label htmlFor="tone">Feedback Tone</Label>
              <Select value={tone} onValueChange={(v) => setTone(v || 'encouraging')}>
                <SelectTrigger id="tone">
                  <SelectValue placeholder="Select feedback tone" />
                </SelectTrigger>
                <SelectContent>
                  {configOptions.tones.map((option: any) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                {configOptions.tones.find((t: any) => t.value === tone)?.description}
              </p>
            </div>

            {/* Detail Level */}
            <div className="space-y-2">
              <Label htmlFor="detail-level">Feedback Detail Level</Label>
              <Select value={detailLevel} onValueChange={(v) => setDetailLevel(v || 'detailed')}>
                <SelectTrigger id="detail-level">
                  <SelectValue placeholder="Select detail level" />
                </SelectTrigger>
                <SelectContent>
                  {configOptions.detailLevels.map((option: any) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                {configOptions.detailLevels.find((d: any) => d.value === detailLevel)?.description}
              </p>
            </div>

            {/* Custom Prompt */}
            <div className="space-y-2">
              <Label htmlFor="custom-prompt">Custom Grading Instructions (Optional)</Label>
              <Textarea
                id="custom-prompt"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Add specific instructions for the AI grader...

Example:
- Pay special attention to code quality and best practices
- Focus on conceptual understanding over syntax
- Require citation of sources for factual claims
- Emphasize critical thinking and analysis"
                rows={8}
                className="font-mono text-sm"
              />
              <p className="text-sm text-muted-foreground">
                These instructions will be added to the AI prompt for more customized grading
              </p>
            </div>

            {/* Info Alert */}
            <Alert>
              <IconInfoCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Pro Tip:</strong> The AI will combine your custom instructions with the
                selected persona and tone. For free-text questions, you can also add specific
                grading criteria and expected keywords in the question editor.
              </AlertDescription>
            </Alert>
          </>
        )}

        {/* Save Button */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            <IconDeviceFloppy className="mr-2 h-4 w-4" />
            {isSaving ? 'Saving...' : 'Save Configuration'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
