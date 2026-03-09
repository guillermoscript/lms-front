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

    case 'audio': {
      const title = block.title ? ` title="${escapeQuotes(block.title)}"` : ''
      return `<Audio src="${block.src}"${title} />`
    }

    case 'embed': {
      const title = block.title ? ` title="${escapeQuotes(block.title)}"` : ''
      const caption = block.caption ? ` caption="${escapeQuotes(block.caption)}"` : ''
      return `<Embed url="${block.url}"${title}${caption} />`
    }

    case 'file-download': {
      const desc = block.description ? ` description="${escapeQuotes(block.description)}"` : ''
      return `<FileDownload url="${block.url}" filename="${escapeQuotes(block.filename)}"${desc} />`
    }

    case 'glossary': {
      const itemsJson = escapeSingleQuotes(JSON.stringify(block.items))
      return `<Glossary items={JSON.parse('${itemsJson}')} />`
    }

    case 'comparison': {
      const sideAJson = escapeSingleQuotes(JSON.stringify(block.sideA))
      const sideBJson = escapeSingleQuotes(JSON.stringify(block.sideB))
      const summary = block.summary ? ` summary="${escapeQuotes(block.summary)}"` : ''
      return `<Comparison sideA={JSON.parse('${sideAJson}')} sideB={JSON.parse('${sideBJson}')}${summary} />`
    }

    case 'table': {
      const headersJson = escapeSingleQuotes(JSON.stringify(block.headers))
      const rowsJson = escapeSingleQuotes(JSON.stringify(block.rows))
      const striped = block.striped ? ' striped={true}' : ''
      return `<Table headers={JSON.parse('${headersJson}')} rows={JSON.parse('${rowsJson}')}${striped} />`
    }

    case 'flashcard-set': {
      const cardsJson = escapeSingleQuotes(JSON.stringify(block.cards))
      return `<FlashcardSet cards={JSON.parse('${cardsJson}')} />`
    }

    case 'fill-in-the-blank': {
      const segmentsJson = escapeSingleQuotes(JSON.stringify(block.segments))
      const explanation = block.explanation ? ` explanation="${escapeQuotes(block.explanation)}"` : ''
      return `<FillInTheBlank segments={JSON.parse('${segmentsJson}')}${explanation} />`
    }

    case 'matching-pairs': {
      const pairsJson = escapeSingleQuotes(JSON.stringify(block.pairs))
      const explanation = block.explanation ? ` explanation="${escapeQuotes(block.explanation)}"` : ''
      return `<MatchingPairs pairs={JSON.parse('${pairsJson}')}${explanation} />`
    }

    case 'ordering': {
      const itemsJson = escapeSingleQuotes(JSON.stringify(block.items))
      const explanation = block.explanation ? ` explanation="${escapeQuotes(block.explanation)}"` : ''
      return `<Ordering items={JSON.parse('${itemsJson}')}${explanation} />`
    }

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

    // Audio component
    if (line.includes('<Audio')) {
      const srcMatch = line.match(/src="([^"]*)"/)
      const titleMatch = line.match(/title="([^"]*)"/)
      blocks.push({
        id: nanoid(),
        type: 'audio',
        src: srcMatch?.[1] || '',
        title: titleMatch?.[1],
      })
      i++
      continue
    }

    // Embed component
    if (line.includes('<Embed')) {
      const urlMatch = line.match(/url="([^"]*)"/)
      const titleMatch = line.match(/title="([^"]*)"/)
      const captionMatch = line.match(/caption="([^"]*)"/)
      blocks.push({
        id: nanoid(),
        type: 'embed',
        url: urlMatch?.[1] || '',
        title: titleMatch?.[1],
        caption: captionMatch?.[1],
      })
      i++
      continue
    }

    // FileDownload component
    if (line.includes('<FileDownload')) {
      const urlMatch = line.match(/url="([^"]*)"/)
      const filenameMatch = line.match(/filename="([^"]*)"/)
      const descMatch = line.match(/description="([^"]*)"/)
      blocks.push({
        id: nanoid(),
        type: 'file-download',
        url: urlMatch?.[1] || '',
        filename: filenameMatch?.[1] || '',
        description: descMatch?.[1],
      })
      i++
      continue
    }

    // Glossary component (JSON.parse pattern)
    if (line.includes('<Glossary') && line.includes('items=')) {
      const jsonMatch = line.match(/items=\{JSON\.parse\('(.+?)'\)\}/)
      let items = [{ term: '', definition: '' }]
      if (jsonMatch) {
        try { items = JSON.parse(jsonMatch[1]) } catch { /* keep default */ }
      }
      blocks.push({ id: nanoid(), type: 'glossary', items })
      i++
      continue
    }

    // Comparison component (JSON.parse pattern)
    if (line.includes('<Comparison')) {
      const sideAMatch = line.match(/sideA=\{JSON\.parse\('(.+?)'\)\}/)
      const sideBMatch = line.match(/sideB=\{JSON\.parse\('(.+?)'\)\}/)
      const summaryMatch = line.match(/summary="([^"]*)"/)
      let sideA = { title: '', points: [''], highlight: 'positive' as const }
      let sideB = { title: '', points: [''], highlight: 'negative' as const }
      if (sideAMatch) {
        try { sideA = JSON.parse(sideAMatch[1]) } catch { /* keep default */ }
      }
      if (sideBMatch) {
        try { sideB = JSON.parse(sideBMatch[1]) } catch { /* keep default */ }
      }
      blocks.push({
        id: nanoid(),
        type: 'comparison',
        sideA,
        sideB,
        summary: summaryMatch?.[1],
      })
      i++
      continue
    }

    // Table component (JSON.parse pattern)
    if (line.includes('<Table') && line.includes('headers=')) {
      const headersMatch = line.match(/headers=\{JSON\.parse\('(.+?)'\)\}/)
      const rowsMatch = line.match(/rows=\{JSON\.parse\('(.+?)'\)\}/)
      const stripedMatch = line.match(/striped=\{true\}/)
      let headers = ['', '']
      let rows = [['', '']]
      if (headersMatch) {
        try { headers = JSON.parse(headersMatch[1]) } catch { /* keep default */ }
      }
      if (rowsMatch) {
        try { rows = JSON.parse(rowsMatch[1]) } catch { /* keep default */ }
      }
      blocks.push({
        id: nanoid(),
        type: 'table',
        headers,
        rows,
        striped: !!stripedMatch,
      })
      i++
      continue
    }

    // FlashcardSet component (JSON.parse pattern)
    if (line.includes('<FlashcardSet')) {
      const cardsMatch = line.match(/cards=\{JSON\.parse\('(.+?)'\)\}/)
      let cards = [{ front: '', back: '' }]
      if (cardsMatch) {
        try { cards = JSON.parse(cardsMatch[1]) } catch { /* keep default */ }
      }
      blocks.push({ id: nanoid(), type: 'flashcard-set', cards })
      i++
      continue
    }

    // FillInTheBlank component (JSON.parse pattern)
    if (line.includes('<FillInTheBlank')) {
      const segmentsMatch = line.match(/segments=\{JSON\.parse\('(.+?)'\)\}/)
      const explanationMatch = line.match(/explanation="([^"]*)"/)
      let segments = [{ type: 'text' as const, value: '' }]
      if (segmentsMatch) {
        try { segments = JSON.parse(segmentsMatch[1]) } catch { /* keep default */ }
      }
      blocks.push({
        id: nanoid(),
        type: 'fill-in-the-blank',
        segments,
        explanation: explanationMatch?.[1],
      })
      i++
      continue
    }

    // MatchingPairs component (JSON.parse pattern)
    if (line.includes('<MatchingPairs')) {
      const pairsMatch = line.match(/pairs=\{JSON\.parse\('(.+?)'\)\}/)
      const explanationMatch = line.match(/explanation="([^"]*)"/)
      let pairs = [{ term: '', match: '' }, { term: '', match: '' }]
      if (pairsMatch) {
        try { pairs = JSON.parse(pairsMatch[1]) } catch { /* keep default */ }
      }
      blocks.push({
        id: nanoid(),
        type: 'matching-pairs',
        pairs,
        explanation: explanationMatch?.[1],
      })
      i++
      continue
    }

    // Ordering component (JSON.parse pattern)
    if (line.includes('<Ordering')) {
      const itemsMatch = line.match(/items=\{JSON\.parse\('(.+?)'\)\}/)
      const explanationMatch = line.match(/explanation="([^"]*)"/)
      let items = ['', '']
      if (itemsMatch) {
        try { items = JSON.parse(itemsMatch[1]) } catch { /* keep default */ }
      }
      blocks.push({
        id: nanoid(),
        type: 'ordering',
        items,
        explanation: explanationMatch?.[1],
      })
      i++
      continue
    }

    // Video component
    if (line.includes('<Video')) {
      const urlMatch = line.match(/url="([^"]*)"/)
      blocks.push({
        id: nanoid(),
        type: 'video',
        url: urlMatch?.[1] || '',
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
