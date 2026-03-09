'use client'

import type {
  Block,
  TextBlock,
  HeadingBlock,
  CalloutBlock,
  CodeBlock as CodeBlockType,
  QuizBlock,
  SpoilerBlock,
  StepsBlock,
  VocabularyBlock,
  DefinitionBlock,
  ImageBlock,
  VideoBlock,
  AudioBlock,
  EmbedBlock,
  FileDownloadBlock,
  GlossaryBlock,
  ComparisonBlock,
  TableBlock,
  FlashcardSetBlock,
  FillInTheBlankBlock,
  MatchingPairsBlock,
  OrderingBlock,
} from './types'
import { TextBlockEditor } from './editors/text-block'
import { HeadingBlockEditor } from './editors/heading-block'
import { CalloutBlockEditor } from './editors/callout-block'
import { CodeBlockEditor } from './editors/code-block'
import { QuizBlockEditor } from './editors/quiz-block'
import { SpoilerBlockEditor } from './editors/spoiler-block'
import { StepsBlockEditor } from './editors/steps-block'
import { VocabularyBlockEditor } from './editors/vocabulary-block'
import { DefinitionBlockEditor } from './editors/definition-block'
import { ImageBlockEditor } from './editors/image-block'
import { VideoBlockEditor } from './editors/video-block'
import { DividerBlockEditor } from './editors/divider-block'
import { AudioBlockEditor } from './editors/audio-block'
import { EmbedBlockEditor } from './editors/embed-block'
import { FileDownloadBlockEditor } from './editors/file-download-block'
import { GlossaryBlockEditor } from './editors/glossary-block'
import { ComparisonBlockEditor } from './editors/comparison-block'
import { TableBlockEditor } from './editors/table-block'
import { FlashcardSetBlockEditor } from './editors/flashcard-set-block'
import { FillInTheBlankBlockEditor } from './editors/fill-in-the-blank-block'
import { MatchingPairsBlockEditor } from './editors/matching-pairs-block'
import { OrderingBlockEditor } from './editors/ordering-block'

interface BlockRendererProps {
  block: Block
  onChange: (updates: Partial<Block>) => void
}

export function BlockRenderer({ block, onChange }: BlockRendererProps) {
  switch (block.type) {
    case 'text':
      return <TextBlockEditor block={block} onChange={onChange} />
    case 'heading':
      return <HeadingBlockEditor block={block} onChange={onChange} />
    case 'callout':
      return <CalloutBlockEditor block={block} onChange={onChange} />
    case 'code':
      return <CodeBlockEditor block={block} onChange={onChange} />
    case 'quiz':
      return <QuizBlockEditor block={block} onChange={onChange} />
    case 'spoiler':
      return <SpoilerBlockEditor block={block} onChange={onChange} />
    case 'steps':
      return <StepsBlockEditor block={block} onChange={onChange} />
    case 'vocabulary':
      return <VocabularyBlockEditor block={block} onChange={onChange} />
    case 'definition':
      return <DefinitionBlockEditor block={block} onChange={onChange} />
    case 'image':
      return <ImageBlockEditor block={block} onChange={onChange} />
    case 'video':
      return <VideoBlockEditor block={block} onChange={onChange} />
    case 'divider':
      return <DividerBlockEditor />
    case 'audio':
      return <AudioBlockEditor block={block} onChange={onChange} />
    case 'embed':
      return <EmbedBlockEditor block={block} onChange={onChange} />
    case 'file-download':
      return <FileDownloadBlockEditor block={block} onChange={onChange} />
    case 'glossary':
      return <GlossaryBlockEditor block={block} onChange={onChange} />
    case 'comparison':
      return <ComparisonBlockEditor block={block} onChange={onChange} />
    case 'table':
      return <TableBlockEditor block={block} onChange={onChange} />
    case 'flashcard-set':
      return <FlashcardSetBlockEditor block={block} onChange={onChange} />
    case 'fill-in-the-blank':
      return <FillInTheBlankBlockEditor block={block} onChange={onChange} />
    case 'matching-pairs':
      return <MatchingPairsBlockEditor block={block} onChange={onChange} />
    case 'ordering':
      return <OrderingBlockEditor block={block} onChange={onChange} />
    default:
      return <div className="text-muted-foreground text-sm">Bloque desconocido</div>
  }
}
