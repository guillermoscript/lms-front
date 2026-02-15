"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { IconPlus } from "@tabler/icons-react"

interface PickerProps {
  onInsert: (snippet: string) => void
}

export function LessonComponentPicker({ onInsert }: PickerProps) {
  const components = [
    { label: "Callout (info)", snippet: '<Callout type="info">Tu mensaje aquí</Callout>\n' },
    { label: "Spoiler / Solution", snippet: '<Spoiler label="Mostrar solución">Respuesta aquí</Spoiler>\n' },
    { label: "Quiz (MCQ)", snippet: "<Quiz question=\"Pregunta?\" options={JSON.parse('[\"A\",\"B\",\"C\"]')} correctIndex={1} explanation=\"Explicación\" />\n" },
    { label: "CodeBlock", snippet: '```javascript\nconsole.log("Hola")\n```\n' },
    { label: "Steps", snippet: '<Steps>\n  <Step title="Paso 1">Descripción</Step>\n</Steps>\n' },
    { label: "Vocabulary", snippet: '<Vocabulary word="Hola" translation="Hello" audioUrl="/audio/hola.mp3" />\n' },
    { label: "Definition", snippet: '<Definition term="API">Definición aquí</Definition>\n' },
    { label: "Compare (Before/After)", snippet: '<BeforeAfter before="Antes" after="Después" />\n' },
  ]

  const [showQuizForm, setShowQuizForm] = React.useState(false)
  const [qQuestion, setQQuestion] = React.useState("")
  const [qExplanation, setQExplanation] = React.useState("")
  const [qOptions, setQOptions] = React.useState<string[]>(["", ""])
  const [qCorrectIndex, setQCorrectIndex] = React.useState<number>(0)

  function resetQuizForm() {
    setQQuestion("")
    setQExplanation("")
    setQOptions(["", ""])
    setQCorrectIndex(0)
  }

  function addOption() {
    setQOptions((s) => [...s, ""])
  }

  function updateOption(idx: number, value: string) {
    setQOptions((s) => s.map((o, i) => (i === idx ? value : o)))
  }

  function submitQuiz() {
    const optionsClean = qOptions.map((o) => o.trim()).filter(Boolean)
    if (!qQuestion.trim() || optionsClean.length < 2) return

    const optionsJson = JSON.stringify(optionsClean)
    const safeQuestion = qQuestion.replace(/"/g, '\\"')
    const safeExplanation = qExplanation.replace(/"/g, '\\"')
    // ensure single quotes inside the JSON string are escaped so we can wrap in single quotes
    const jsonForParse = optionsJson.replace(/'/g, "\\'")

    const snippet = `<Quiz question="${safeQuestion}" options={JSON.parse('${jsonForParse}')} correctIndex={${Math.min(
      qCorrectIndex,
      optionsClean.length - 1,
    )}} explanation="${safeExplanation}" />\n`

    onInsert(snippet)
    resetQuizForm()
    setShowQuizForm(false)
  }

  return (
    <Popover>
      <div>
        <PopoverTrigger>
          <Button variant="ghost">
            <IconPlus className="mr-2" /> Insertar componente
          </Button>
        </PopoverTrigger>
      </div>
      <PopoverContent className="w-80">
        {!showQuizForm ? (
          <div className="flex flex-col gap-2">
            {components.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={() => {
                  if (c.label.startsWith("Quiz")) {
                    setShowQuizForm(true)
                    return
                  }
                  onInsert(c.snippet)
                }}
                className="text-sm text-left rounded px-2 py-1 hover:bg-muted"
              >
                {c.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <label className="text-sm">Pregunta</label>
            <input
              className="input"
              value={qQuestion}
              onChange={(e) => setQQuestion(e.target.value)}
              placeholder="Escribe la pregunta..."
            />

            <label className="text-sm">Opciones</label>
            <div className="flex flex-col gap-1">
              {qOptions.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correct"
                    checked={qCorrectIndex === idx}
                    onChange={() => setQCorrectIndex(idx)}
                    aria-label={`Marcar opción ${idx + 1} como correcta`}
                  />
                  <input
                    className="input flex-1"
                    value={opt}
                    onChange={(e) => updateOption(idx, e.target.value)}
                    placeholder={`Opción ${idx + 1}`}
                  />
                </div>
              ))}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={addOption} type="button">
                  Añadir opción
                </Button>
              </div>
            </div>

            <label className="text-sm">Explicación (opcional)</label>
            <input
              className="input"
              value={qExplanation}
              onChange={(e) => setQExplanation(e.target.value)}
              placeholder="Explicación mostrada tras la respuesta"
            />

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { resetQuizForm(); setShowQuizForm(false); }}>
                Cancelar
              </Button>
              <Button onClick={submitQuiz}>Insertar Quiz</Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

export default LessonComponentPicker
