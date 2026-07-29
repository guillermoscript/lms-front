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
  | 'audio'
  | 'embed'
  | 'file-download'
  | 'glossary'
  | 'comparison'
  | 'table'
  | 'flashcard-set'
  | 'fill-in-the-blank'
  | 'matching-pairs'
  | 'ordering'
  | 'checkpoint'

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

export interface AudioBlock extends BaseBlock {
  type: 'audio'
  src: string
  title?: string
}

export interface EmbedBlock extends BaseBlock {
  type: 'embed'
  url: string
  title?: string
  caption?: string
}

export interface FileDownloadBlock extends BaseBlock {
  type: 'file-download'
  url: string
  filename: string
  description?: string
}

export interface GlossaryBlock extends BaseBlock {
  type: 'glossary'
  items: { term: string; definition: string }[]
}

export interface ComparisonBlock extends BaseBlock {
  type: 'comparison'
  sideA: { title: string; points: string[]; highlight: 'positive' | 'negative' | 'neutral' }
  sideB: { title: string; points: string[]; highlight: 'positive' | 'negative' | 'neutral' }
  summary?: string
}

export interface TableBlock extends BaseBlock {
  type: 'table'
  headers: string[]
  rows: string[][]
  striped?: boolean
}

export interface FlashcardSetBlock extends BaseBlock {
  type: 'flashcard-set'
  cards: { front: string; back: string }[]
}

export interface FillInTheBlankSegment {
  type: 'text' | 'blank'
  value: string
}

export interface FillInTheBlankBlock extends BaseBlock {
  type: 'fill-in-the-blank'
  segments: FillInTheBlankSegment[]
  explanation?: string
}

export interface MatchingPairsBlock extends BaseBlock {
  type: 'matching-pairs'
  pairs: { term: string; match: string }[]
  explanation?: string
}

export interface OrderingBlock extends BaseBlock {
  type: 'ordering'
  items: string[]
  explanation?: string
}

export interface CheckpointBlock extends BaseBlock {
  type: 'checkpoint'
  checkpointId: number | null
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
  | AudioBlock
  | EmbedBlock
  | FileDownloadBlock
  | GlossaryBlock
  | ComparisonBlock
  | TableBlock
  | FlashcardSetBlock
  | FillInTheBlankBlock
  | MatchingPairsBlock
  | OrderingBlock
  | CheckpointBlock

// Block labels and descriptions are translated at the view
// (dashboard.teacher.lessonEditor.blockEditor.blocks.<type>), keyed by BlockType.

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
    case 'audio':
      return { id, type: 'audio', src: '' }
    case 'embed':
      return { id, type: 'embed', url: '' }
    case 'file-download':
      return { id, type: 'file-download', url: '', filename: '' }
    case 'glossary':
      return { id, type: 'glossary', items: [{ term: '', definition: '' }] }
    case 'comparison':
      return {
        id, type: 'comparison',
        sideA: { title: '', points: [''], highlight: 'positive' },
        sideB: { title: '', points: [''], highlight: 'negative' },
      }
    case 'table':
      return { id, type: 'table', headers: ['Columna 1', 'Columna 2'], rows: [['', '']] }
    case 'flashcard-set':
      return { id, type: 'flashcard-set', cards: [{ front: '', back: '' }] }
    case 'fill-in-the-blank':
      return { id, type: 'fill-in-the-blank', segments: [{ type: 'text', value: '' }] }
    case 'matching-pairs':
      return { id, type: 'matching-pairs', pairs: [{ term: '', match: '' }, { term: '', match: '' }] }
    case 'ordering':
      return { id, type: 'ordering', items: ['', ''] }
    case 'checkpoint':
      return { id, type: 'checkpoint', checkpointId: null }
  }
}
