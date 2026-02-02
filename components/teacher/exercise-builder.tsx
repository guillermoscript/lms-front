'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PromptTemplateSelector } from './prompt-template-selector'
import { AIPreviewModal } from './ai-preview-modal'
import { IconLoader2, IconDeviceFloppy } from '@tabler/icons-react'

interface ExerciseBuilderProps {
  courseId: number
  lessonId?: number
  initialData?: any
}

export function ExerciseBuilder({ courseId, lessonId, initialData }: ExerciseBuilderProps) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    description: initialData?.description || '',
    instructions: initialData?.instructions || '',
    exercise_type: initialData?.exercise_type || 'essay',
    difficulty_level: initialData?.difficulty_level || 'medium',
    time_limit: initialData?.time_limit || 30,
    system_prompt: initialData?.system_prompt || '',
  })

  const handleTemplateSelect = (template: any) => {
    // Replace variables with placeholders
    setFormData({
      ...formData,
      instructions: template.task_description_template || formData.instructions,
      system_prompt: template.system_prompt_template || formData.system_prompt,
    })
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const exerciseData = {
        course_id: courseId,
        lesson_id: lessonId || null,
        title: formData.title,
        description: formData.description,
        instructions: formData.instructions,
        exercise_type: formData.exercise_type,
        difficulty_level: formData.difficulty_level,
        time_limit: formData.time_limit,
        system_prompt: formData.system_prompt,
        created_by: user.id,
      }

      if (initialData) {
        await supabase.from('exercises').update(exerciseData).eq('id', initialData.id)
      } else {
        await supabase.from('exercises').insert([exerciseData])
      }

      router.push(`/dashboard/teacher/courses/${courseId}`)
      router.refresh()
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Exercise Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Exercise Type</Label>
            <Select value={formData.exercise_type} onValueChange={(val) => setFormData({ ...formData, exercise_type: val })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="essay">Essay</SelectItem>
                <SelectItem value="coding_challenge">Coding Challenge</SelectItem>
                <SelectItem value="quiz">Quiz</SelectItem>
                <SelectItem value="discussion">Discussion</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Title</Label>
            <Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} />
          </div>

          <div>
            <Label>Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
            />
          </div>

          <div>
            <Label>Instructions</Label>
            <Textarea
              value={formData.instructions}
              onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
              rows={4}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Difficulty Level</Label>
              <Select value={formData.difficulty_level} onValueChange={(val) => setFormData({ ...formData, difficulty_level: val })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="beginner">Beginner</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="advanced">Advanced</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Time Limit (minutes)</Label>
              <Input
                type="number"
                value={formData.time_limit}
                onChange={(e) => setFormData({ ...formData, time_limit: parseInt(e.target.value) })}
              />
            </div>
          </div>

          <div>
            <Label>AI System Prompt</Label>
            <Textarea
              value={formData.system_prompt}
              onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
              rows={6}
              placeholder="Define how the AI should evaluate student work..."
            />
            <div className="flex gap-2 mt-2">
              <PromptTemplateSelector category="exercise" onSelect={handleTemplateSelect} />
              <AIPreviewModal type="exercise" config={{ system_prompt: formData.system_prompt, instructions: formData.instructions }} />
            </div>
          </div>

          <div className="flex gap-3">
            <Button onClick={handleSave} disabled={loading || !formData.title}>
              {loading ? <IconLoader2 className="animate-spin h-4 w-4 mr-2" /> : <IconDeviceFloppy className="h-4 w-4 mr-2" />}
              Save Exercise
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
