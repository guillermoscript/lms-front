import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

// This script upserts lessons_ai_tasks for selected lesson IDs.
// Run with: npx tsx scripts/add_ai_tasks.ts

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE env vars. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

function lessonTaskSystemPrompt(title: string) {
  return `Eres un tutor AI experto y paciente. Lee la lección titulada: "${title}" y ayuda al estudiante a entenderla.\n\n- Extrae los puntos clave.\n- Proporciona explicaciones paso a paso con ejemplos cuando sea necesario.\n- Propón una actividad práctica corta que el estudiante pueda realizar ahora.\n- Ofrece retroalimentación formativa y, si el alumno demuestra comprensión, usa la acción de marcar como completado.`
}

const tasks = [
  {
    lesson_id: 8,
    task_instructions: 'Resume la estructura básica de un documento HTML y crea un archivo index.html mínimo.',
    system_prompt: lessonTaskSystemPrompt('Introducción a HTML - Estructura básica'),
  },
  {
    lesson_id: 9,
    task_instructions: 'Escribe un párrafo que incluya texto en negrita y cursiva usando las etiquetas apropiadas.',
    system_prompt: lessonTaskSystemPrompt('Etiquetas de texto y párrafos'),
  },
  {
    lesson_id: 10,
    task_instructions: 'Implementa la función `sumar(a, b)` que devuelva la suma y muéstrala con un ejemplo de uso.',
    system_prompt: lessonTaskSystemPrompt('Funciones básicas en JavaScript'),
  },
  {
    lesson_id: 11,
    task_instructions: 'Practica un saludo en inglés: escribe una frase de presentación y tradúcela al español.',
    system_prompt: lessonTaskSystemPrompt('Saludos y presentaciones'),
  },
]

async function upsertTasks() {
  for (const t of tasks) {
    console.log('Upserting task for lesson', t.lesson_id)
    const { data, error } = await supabase.from('lessons_ai_tasks').upsert({
      lesson_id: t.lesson_id,
      task_instructions: t.task_instructions,
      system_prompt: t.system_prompt,
    }, { onConflict: 'lesson_id' }).select().single()

    if (error) {
      console.error('Error upserting lesson task', t.lesson_id, error)
    } else {
      console.log('Upserted:', data)
    }
  }
}

upsertTasks().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1) })
