'use client'

import { Streamdown } from 'streamdown'

// Bare Streamdown (no code/mermaid/math plugins): task instructions are
// teacher- or AI-authored markdown, and the heavy plugins would land in the
// page's eager bundle instead of the chat's dynamic chunk.
export function TaskInstructions({ text }: { text: string }) {
  return (
    <Streamdown className="text-sm text-foreground leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_h1]:text-base [&_h2]:text-base [&_h3]:text-sm [&_h4]:text-sm">
      {text}
    </Streamdown>
  )
}
