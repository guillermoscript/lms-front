import type { MDXComponents } from 'mdx/types'
import {
  Callout,
  Info,
  Warning,
  Tip,
  Success,
  Danger,
  Spoiler,
  Solution,
  Hint,
  Answer,
  Quiz,
  CodeBlock,
  Code,
  Pre,
  Vocabulary,
  Steps,
  Step,
  Definition,
  Glossary,
  Compare,
  CodeCompare,
  BeforeAfter,
} from './index'

/**
 * MDX Components map for lesson content
 * 
 * These components are available in MDX content:
 * 
 * ## Callouts
 * - <Callout type="info|warning|tip|success|danger">...</Callout>
 * - <Info>...</Info>, <Warning>...</Warning>, <Tip>...</Tip>, etc.
 * 
 * ## Spoilers (hidden content)
 * - <Spoiler label="Click to reveal">...</Spoiler>
 * - <Solution>...</Solution>, <Hint>...</Hint>, <Answer>...</Answer>
 * 
 * ## Quiz
 * - <Quiz question="..." options={[...]} correctIndex={0} explanation="..." />
 * 
 * ## Code
 * - <CodeBlock language="js" filename="example.js">...</CodeBlock>
 * - Standard markdown code blocks with ```language are also supported
 * 
 * ## Vocabulary (language learning)
 * - <Vocabulary word="..." translation="..." pronunciation="..." audioUrl="..." />
 * 
 * ## Steps
 * - <Steps><Step title="...">...</Step></Steps>
 * 
 * ## Definitions
 * - <Definition term="...">...</Definition>
 * - <Glossary><Definition term="...">...</Definition></Glossary>
 * 
 * ## Comparisons
 * - <Compare left={...} right={...} />
 * - <CodeCompare before="..." after="..." language="js" />
 * - <BeforeAfter before="..." after="..." />
 */
export const lessonMdxComponents: MDXComponents = {
  // Override default code elements
  pre: Pre,
  code: Code,
  
  // Callout components
  Callout,
  Info,
  Warning,
  Tip,
  Success,
  Danger,
  
  // Spoiler components
  Spoiler,
  Solution,
  Hint,
  Answer,
  
  // Quiz
  Quiz,
  
  // Code components
  CodeBlock,
  
  // Vocabulary
  Vocabulary,
  
  // Steps
  Steps,
  Step,
  
  // Definitions
  Definition,
  Glossary,
  
  // Comparisons
  Compare,
  CodeCompare,
  BeforeAfter,
}

export default lessonMdxComponents
