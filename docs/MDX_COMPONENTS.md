# MDX Components for Lessons

This document describes the custom MDX components available for creating interactive lesson content in the LMS.

## Overview

Lesson content is stored in the database as MDX (Markdown + JSX) and rendered using `next-mdx-remote-client`. This allows teachers to create rich, interactive content using simple markdown syntax combined with custom React components.

> **Note:** While MDX components remain the rendering foundation for lesson content, teachers primarily create content through the **Block Editor** — a visual editing interface that serializes to MDX. See the [Block Editor](#block-editor) section below for details.

## Available Components

### 1. Callouts

Highlight important information with visual callouts.

```mdx
<Callout type="info">
  This is an informational message.
</Callout>

<Warning>
  Be careful with this operation!
</Warning>

<Tip>
  Pro tip: Use keyboard shortcuts to work faster.
</Tip>

<Success>
  Great job! You've completed this section.
</Success>

<Danger>
  This action cannot be undone.
</Danger>
```

**Props:**
- `type`: `'info' | 'warning' | 'tip' | 'success' | 'danger'` (default: `'info'`)
- `title`: Optional custom title

**Aliases:** `<Info>`, `<Warning>`, `<Tip>`, `<Success>`, `<Danger>`

---

### 2. Spoiler / Solution

Hide content that students should try to figure out first.

```mdx
<Spoiler label="Click to reveal the answer">
  The answer is 42.
</Spoiler>

<Solution>
  Here's the complete solution code...
</Solution>

<Hint>
  Try thinking about this problem differently.
</Hint>

<Answer>
  The correct answer is B.
</Answer>
```

**Props:**
- `label`: Text shown on the reveal button (default varies by type)
- `defaultOpen`: Start expanded (default: `false`)

**Aliases:** `<Solution>`, `<Hint>`, `<Answer>`

---

### 3. Quiz

Interactive multiple-choice questions with instant feedback.

```mdx
<Quiz 
  question="What is the capital of France?"
  options={["London", "Paris", "Berlin", "Madrid"]}
  correctIndex={1}
  explanation="Paris has been the capital of France since the 10th century."
/>
```

**Props:**
- `question`: The question text (required)
- `options`: Array of answer options (required)
- `correctIndex`: Index of the correct answer, 0-based (required)
- `explanation`: Explanation shown after answering

---

### 4. CodeBlock

Display code with syntax highlighting and copy button.

````mdx
```javascript
function greet(name) {
  return `Hello, ${name}!`;
}
```

<CodeBlock language="python" filename="example.py" showLineNumbers>
def greet(name):
    return f"Hello, {name}!"
</CodeBlock>
````

**Props:**
- `language`: Programming language for syntax highlighting
- `filename`: Optional filename to display
- `showLineNumbers`: Show line numbers (default: `false`)
- `highlightLines`: Array of line numbers to highlight

Standard markdown code fences are automatically converted to `<CodeBlock>`.

---

### 5. Vocabulary

For language learning - display words with translations and audio.

```mdx
<Vocabulary 
  word="Hola"
  translation="Hello"
  pronunciation="/ˈola/"
  audioUrl="/audio/hola.mp3"
  example="¡Hola! ¿Cómo estás?"
  exampleTranslation="Hello! How are you?"
/>
```

**Props:**
- `word`: The word or phrase (required)
- `translation`: Translation in target language (required)
- `pronunciation`: IPA or phonetic pronunciation
- `audioUrl`: URL to audio pronunciation
- `example`: Example sentence using the word
- `exampleTranslation`: Translation of the example

---

### 6. Steps

Display sequential instructions with numbered steps.

```mdx
<Steps>
  <Step title="Install dependencies">
    Run `npm install` to install all required packages.
  </Step>
  <Step title="Configure environment">
    Create a `.env.local` file with your settings.
  </Step>
  <Step title="Start development server">
    Run `npm run dev` to start the server.
  </Step>
</Steps>
```

**Props (Steps):**
- `startFrom`: Starting number (default: `1`)

**Props (Step):**
- `title`: Step title (optional)

---

### 7. Definition / Glossary

Display terms with their definitions.

```mdx
<Definition term="API">
  An Application Programming Interface is a set of protocols and tools 
  for building software applications.
</Definition>

<Glossary>
  <Definition term="REST">
    Representational State Transfer - an architectural style for APIs.
  </Definition>
  <Definition term="JSON">
    JavaScript Object Notation - a lightweight data interchange format.
  </Definition>
</Glossary>
```

**Props (Definition):**
- `term`: The term being defined (required)

---

### 8. Compare

Side-by-side comparisons for showing differences.

```mdx
<Compare
  left={{
    title: "Before",
    content: "The old way of doing things"
  }}
  right={{
    title: "After", 
    content: "The new improved approach"
  }}
/>

<CodeCompare
  before={`const x = 1;`}
  after={`const x: number = 1;`}
  language="typescript"
  beforeTitle="JavaScript"
  afterTitle="TypeScript"
/>

<BeforeAfter
  before="Confusing instructions that are hard to follow"
  after="Clear, step-by-step guide that anyone can understand"
/>
```

**Props (Compare):**
- `left`: `{ title?: string, content: ReactNode }`
- `right`: `{ title?: string, content: ReactNode }`

**Props (CodeCompare):**
- `before`: Code before changes (required)
- `after`: Code after changes (required)
- `language`: Programming language
- `beforeTitle`: Label for before (default: "Before")
- `afterTitle`: Label for after (default: "After")

**Props (BeforeAfter):**
- `before`: Text/content before (required)
- `after`: Text/content after (required)
- `beforeLabel`: Label (default: "Before")
- `afterLabel`: Label (default: "After")

---

## Standard Markdown Features

All standard markdown features are supported:

- **Headings**: `# H1`, `## H2`, `### H3`, etc.
- **Emphasis**: `*italic*`, `**bold**`, `***bold italic***`
- **Lists**: Ordered and unordered
- **Links**: `[text](url)`
- **Images**: `![alt](url)`
- **Blockquotes**: `> quote`
- **Tables**: GFM table syntax
- **Code**: Inline \`code\` and fenced code blocks

---

## Technical Details

### How It Works

1. Content is stored as MDX string in the `lessons.content` column
2. On page load, `next-mdx-remote-client` compiles the MDX on the client
3. The compiled MDX is rendered with custom components from `components/lesson/mdx-components.tsx`

### Files

- `components/lesson/` - All lesson MDX components
- `components/lesson/index.ts` - Barrel export
- `components/lesson/mdx-components.tsx` - Component map for MDX
- `app/[locale]/dashboard/student/courses/[courseId]/lessons/[lessonId]/lesson-content.tsx` - Renderer

### Adding New Components

1. Create component in `components/lesson/`
2. Export from `components/lesson/index.ts`
3. Add to `lessonMdxComponents` in `components/lesson/mdx-components.tsx`

---

## Example Lesson Content

```mdx
# Introduction to Variables

Variables are containers for storing data values.

<Tip>
  Choose meaningful variable names that describe what the data represents.
</Tip>

## Declaring Variables

<Steps>
  <Step title="Use const for constants">
    Use `const` when the value won't change.
  </Step>
  <Step title="Use let for variables">
    Use `let` when the value might change.
  </Step>
</Steps>

```javascript
const PI = 3.14159;
let count = 0;
```

<Quiz
  question="Which keyword should you use for a value that won't change?"
  options={["var", "let", "const", "variable"]}
  correctIndex={2}
  explanation="const is used for values that remain constant throughout the program."
/>

<Definition term="Variable">
  A named storage location in memory that holds a value which can be 
  referenced and manipulated in a program.
</Definition>

<Solution>
Here's the complete example:

```javascript
const greeting = "Hello";
let name = "World";
console.log(`${greeting}, ${name}!`);
```
</Solution>
```

---

## Block Editor

The **Block Editor** is the primary lesson editing interface for teachers. It provides a visual, drag-and-drop editing experience that wraps MDX content in a structured block-based editor.

**Location:** `components/teacher/block-editor/`

### How It Works

1. Teachers create content using visual blocks in the editor
2. Blocks are serialized to MDX via `serializer.ts`
3. The resulting MDX is stored in `lessons.content` and rendered using the MDX components documented above

### Block Types (22 total)

The block editor supports all standard MDX component types plus additional interactive block types:

| Block Type | Description |
|-----------|-------------|
| Text / Heading | Rich text and headings (standard MDX) |
| Code | Code blocks with syntax highlighting |
| Image / Video | Media embeds |
| Quiz | Interactive multiple-choice questions |
| Callout | Info/warning/tip/success/danger callouts |
| Steps | Sequential instruction blocks |
| Vocabulary | Language learning word cards |
| Spoiler / Solution | Collapsible content |
| **Audio** | Audio file playback blocks |
| **Embed** | External content embeds (YouTube, etc.) |
| **File-Download** | Downloadable file attachments |
| **Flashcard-Set** | Interactive flashcard decks |
| **Fill-in-the-Blank** | Cloze-style exercises |
| **Matching-Pairs** | Match items between two columns |
| **Ordering** | Drag-to-reorder exercises |
| **Comparison** | Side-by-side content comparison |
| **Table** | Structured data tables |
| **Glossary** | Term-definition collections |

The block types marked in bold go beyond the base MDX component set and are unique to the block editor experience.

### Key Files

| File | Purpose |
|------|---------|
| `components/teacher/block-editor/block-editor.tsx` | Main editor component |
| `components/teacher/block-editor/serializer.ts` | Converts blocks to MDX string |
| `components/teacher/block-editor/blocks/` | Individual block type components |

---

## Dark Mode Support

All components automatically support dark mode through Tailwind's `dark:` variant classes. No additional configuration is needed.

## Accessibility

Components are built with accessibility in mind:
- Proper ARIA labels and roles
- Keyboard navigation support
- Screen reader announcements
- Sufficient color contrast
