import { nanoid } from 'nanoid'

// Block types for the visual lesson editor

export type BlockType =
  | 'text'
  | 'heading'
  | 'callout'
  | 'code'
  | 'quiz'
  | 'spoiler'
  | 'steps'
  | 'vocabulary'
  | 'definition'
  | 'image'
  | 'video'
  | 'divider'

export interface BaseBlock {
  id: string
  type: BlockType
}

export interface TextBlock extends BaseBlock {
  type: 'text'
  content: string
}

export interface HeadingBlock extends BaseBlock {
  type: 'heading'
  level: 1 | 2 | 3
  content: string
}

export interface CalloutBlock extends BaseBlock {
  type: 'callout'
  variant: 'info' | 'warning' | 'success' | 'error'
  content: string
}

export interface CodeBlock extends BaseBlock {
  type: 'code'
  language: string
  filename?: string
  code: string
}

export interface QuizBlock extends BaseBlock {
  type: 'quiz'
  question: string
  options: string[]
  correctIndex: number
  explanation?: string
}

export interface SpoilerBlock extends BaseBlock {
  type: 'spoiler'
  label: string
  content: string
}

export interface StepItem {
  title: string
  content: string
}

export interface StepsBlock extends BaseBlock {
  type: 'steps'
  steps: StepItem[]
}

export interface VocabularyBlock extends BaseBlock {
  type: 'vocabulary'
  word: string
  translation: string
  audioUrl?: string
}

export interface DefinitionBlock extends BaseBlock {
  type: 'definition'
  term: string
  definition: string
}

export interface ImageBlock extends BaseBlock {
  type: 'image'
  src: string
  alt: string
  caption?: string
}

export interface VideoBlock extends BaseBlock {
  type: 'video'
  url: string
}

export interface DividerBlock extends BaseBlock {
  type: 'divider'
}

export type Block =
  | TextBlock
  | HeadingBlock
  | CalloutBlock
  | CodeBlock
  | QuizBlock
  | SpoilerBlock
  | StepsBlock
  | VocabularyBlock
  | DefinitionBlock
  | ImageBlock
  | VideoBlock
  | DividerBlock

// Block metadata for the add menu
export interface BlockMeta {
  type: BlockType
  label: string
  icon: string
  description: string
}

export const BLOCK_METAS: BlockMeta[] = [
  { type: 'text', label: 'Texto', icon: 'text', description: 'Párrafo de texto con formato' },
  { type: 'heading', label: 'Encabezado', icon: 'heading', description: 'Título o subtítulo' },
  { type: 'callout', label: 'Callout', icon: 'alert', description: 'Nota destacada (info, warning, etc.)' },
  { type: 'code', label: 'Código', icon: 'code', description: 'Bloque de código con resaltado' },
  { type: 'quiz', label: 'Quiz', icon: 'quiz', description: 'Pregunta de opción múltiple' },
  { type: 'spoiler', label: 'Spoiler', icon: 'eye-off', description: 'Contenido oculto expandible' },
  { type: 'steps', label: 'Pasos', icon: 'list-numbers', description: 'Lista de pasos numerados' },
  { type: 'vocabulary', label: 'Vocabulario', icon: 'book', description: 'Palabra con traducción' },
  { type: 'definition', label: 'Definición', icon: 'book-open', description: 'Término con definición' },
  { type: 'image', label: 'Imagen', icon: 'photo', description: 'Imagen con caption' },
  { type: 'video', label: 'Video', icon: 'video', description: 'Video embebido' },
  { type: 'divider', label: 'Separador', icon: 'minus', description: 'Línea divisoria' },
]

// Factory to create empty blocks
export function createBlock(type: BlockType): Block {
  const id = nanoid()
  
  switch (type) {
    case 'text':
      return { id, type: 'text', content: '' }
    case 'heading':
      return { id, type: 'heading', level: 2, content: '' }
    case 'callout':
      return { id, type: 'callout', variant: 'info', content: '' }
    case 'code':
      return { id, type: 'code', language: 'javascript', code: '' }
    case 'quiz':
      return { id, type: 'quiz', question: '', options: ['', ''], correctIndex: 0 }
    case 'spoiler':
      return { id, type: 'spoiler', label: 'Mostrar respuesta', content: '' }
    case 'steps':
      return { id, type: 'steps', steps: [{ title: 'Paso 1', content: '' }] }
    case 'vocabulary':
      return { id, type: 'vocabulary', word: '', translation: '' }
    case 'definition':
      return { id, type: 'definition', term: '', definition: '' }
    case 'image':
      return { id, type: 'image', src: '', alt: '' }
    case 'video':
      return { id, type: 'video', url: '' }
    case 'divider':
      return { id, type: 'divider' }
  }
}
