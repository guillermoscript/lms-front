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
    default:
      return <div className="text-muted-foreground text-sm">Bloque desconocido</div>
  }
}
