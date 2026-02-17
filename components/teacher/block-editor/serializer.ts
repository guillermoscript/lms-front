import { nanoid } from 'nanoid'
import type { Block } from './types'

/**
 * Serialize blocks array to MDX string
 */
export function blocksToMdx(blocks: Block[]): string {
  return blocks.map(blockToMdx).join('\n\n')
}

function blockToMdx(block: Block): string {
  switch (block.type) {
    case 'text':
      return block.content || ''
    
    case 'heading': {
      const prefix = '#'.repeat(block.level)
      return `${prefix} ${block.content}`
    }
    
    case 'callout':
      return `<Callout type="${block.variant}">\n${block.content}\n</Callout>`
    
    case 'code': {
      const meta = block.filename ? ` title="${block.filename}"` : ''
      return `\`\`\`${block.language}${meta}\n${block.code}\n\`\`\``
    }
    
  case 'quiz': {
      // Use JSON.parse('<json>') in MDX props to avoid Acorn parse errors
      const optionsJson = JSON.stringify(block.options)
      const optionsJsonEscaped = escapeSingleQuotes(optionsJson)
      const explanation = block.explanation ? ` explanation="${escapeQuotes(block.explanation)}"` : ''
      return `<Quiz question="${escapeQuotes(block.question)}" options={JSON.parse('${optionsJsonEscaped}')} correctIndex={${block.correctIndex}}${explanation} />`
    }
    
    case 'spoiler':
      return `<Spoiler label="${escapeQuotes(block.label)}">\n${block.content}\n</Spoiler>`
    
    case 'steps': {
      const stepsContent = block.steps
        .map(s => `  <Step title="${escapeQuotes(s.title)}">${s.content}</Step>`)
        .join('\n')
      return `<Steps>\n${stepsContent}\n</Steps>`
    }
    
    case 'vocabulary': {
      const audio = block.audioUrl ? ` audioUrl="${block.audioUrl}"` : ''
      return `<Vocabulary word="${escapeQuotes(block.word)}" translation="${escapeQuotes(block.translation)}"${audio} />`
    }
    
    case 'definition':
      return `<Definition term="${escapeQuotes(block.term)}">\n${block.definition}\n</Definition>`
    
    case 'image': {
      const caption = block.caption ? `\n*${block.caption}*` : ''
      return `![${block.alt}](${block.src})${caption}`
    }
    
    case 'video':
      return `<Video url="${block.url}" />`
    
    case 'divider':
      return '---'
    
    default:
      return ''
  }
}

function escapeQuotes(str: string): string {
  return str.replace(/"/g, '\\"')
}

function escapeSingleQuotes(str: string): string {
  // Escape single quotes so the JSON string can be wrapped in single quotes in MDX
  return str.replace(/'/g, "\\'")
}

/**
 * Parse MDX string to blocks array (basic parser)
 * This is a best-effort parser for common patterns
 */
export function mdxToBlocks(mdx: string): Block[] {
  if (!mdx.trim()) return []
  
  const blocks: Block[] = []
  const lines = mdx.split('\n')
  let i = 0
  
  while (i < lines.length) {
    const line = lines[i]
    
    // Skip empty lines
    if (!line.trim()) {
      i++
      continue
    }
    
    // Divider
    if (line.trim() === '---') {
      blocks.push({ id: nanoid(), type: 'divider' })
      i++
      continue
    }
    
    // Heading
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/)
    if (headingMatch) {
      blocks.push({
        id: nanoid(),
        type: 'heading',
        level: headingMatch[1].length as 1 | 2 | 3,
        content: headingMatch[2],
      })
      i++
      continue
    }
    
    // Code block
    if (line.startsWith('```')) {
      const langMatch = line.match(/^```(\w+)?/)
      const language = langMatch?.[1] || 'text'
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      blocks.push({
        id: nanoid(),
        type: 'code',
        language,
        code: codeLines.join('\n'),
      })
      i++ // skip closing ```
      continue
    }
    
    // Callout component
    if (line.includes('<Callout')) {
      const typeMatch = line.match(/type="(\w+)"/)
      const variant = (typeMatch?.[1] || 'info') as 'info' | 'warning' | 'success' | 'error'
      const contentLines: string[] = []
      
      // Check for self-closing or multi-line
      if (line.includes('/>')) {
        const contentMatch = line.match(/>([^<]+)<\/Callout>/)
        blocks.push({
          id: nanoid(),
          type: 'callout',
          variant,
          content: contentMatch?.[1] || '',
        })
        i++
        continue
      }
      
      i++
      while (i < lines.length && !lines[i].includes('</Callout>')) {
        contentLines.push(lines[i])
        i++
      }
      blocks.push({
        id: nanoid(),
        type: 'callout',
        variant,
        content: contentLines.join('\n'),
      })
      i++ // skip closing tag
      continue
    }
    
    // Quiz component
    if (line.includes('<Quiz')) {
      const questionMatch = line.match(/question="([^"]+)"/)
      const optionsMatch = line.match(/options=\{(\[[^\]]+\])\}/)
      const optionsJsonParseMatch = line.match(/options=\{JSON\.parse\('([^']+)'\)\}/)
      const correctMatch = line.match(/correctIndex=\{(\d+)\}/)
      const explanationMatch = line.match(/explanation="([^"]+)"/)
      
      let options: string[] = ['', '']
      if (optionsMatch) {
        try {
          options = JSON.parse(optionsMatch[1])
        } catch {
          // keep default
        }
      } else if (optionsJsonParseMatch) {
        try {
          options = JSON.parse(optionsJsonParseMatch[1])
        } catch {
          // keep default
        }
      }
      
      blocks.push({
        id: nanoid(),
        type: 'quiz',
        question: questionMatch?.[1] || '',
        options,
        correctIndex: parseInt(correctMatch?.[1] || '0'),
        explanation: explanationMatch?.[1],
      })
      i++
      continue
    }
    
    // Spoiler component
    if (line.includes('<Spoiler')) {
      const labelMatch = line.match(/label="([^"]+)"/)
      const contentLines: string[] = []
      i++
      while (i < lines.length && !lines[i].includes('</Spoiler>')) {
        contentLines.push(lines[i])
        i++
      }
      blocks.push({
        id: nanoid(),
        type: 'spoiler',
        label: labelMatch?.[1] || 'Mostrar',
        content: contentLines.join('\n'),
      })
      i++
      continue
    }
    
    // Image
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/)
    if (imgMatch) {
      blocks.push({
        id: nanoid(),
        type: 'image',
        alt: imgMatch[1],
        src: imgMatch[2],
      })
      i++
      continue
    }
    
    // Default: treat as text paragraph
    // Collect consecutive non-special lines as one text block
    const textLines: string[] = [line]
    i++
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].startsWith('#') &&
      !lines[i].startsWith('```') &&
      !lines[i].startsWith('<') &&
      !lines[i].startsWith('!') &&
      lines[i].trim() !== '---'
    ) {
      textLines.push(lines[i])
      i++
    }
    blocks.push({
      id: nanoid(),
      type: 'text',
      content: textLines.join('\n'),
    })
  }
  
  return blocks
}
