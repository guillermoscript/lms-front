# Exercise AI Workspace Design

## Goal

Make standalone student exercises easier to read and complete while keeping AI help immediately accessible. The exercise experience should feel consistent with the lesson AI-task chat on every screen size without forcing students to scroll between task content and conversation.

## Experience

### Mobile

The exercise workspace has a compact, full-width tab bar with **Task** selected initially and **AI chat** as the adjacent tab.

- **Task** contains the exercise heading, instructions, response surface, completion state, and any exercise-specific controls.
- **AI chat** uses the existing ExerciseChat conversation and composer in a viewport-aware, full-height panel. Its composer remains above the mobile keyboard.
- Tab changes preserve task input and chat state. The chat tab stays visibly available and receives an unread/activity cue only when the existing chat state can reliably provide one; no fabricated notification count is introduced.
- The tabs meet 44 px touch-target requirements, have clear selected state, and work with keyboard navigation and screen readers through the existing Tabs primitive.

### Desktop

At the `lg` breakpoint, the same workspace becomes a two-pane layout.

- The left pane is the task and exercise surface, sized for uninterrupted reading and working.
- The right pane is a sticky AI coach panel with a constrained viewport height and its own conversation scroll area.
- The right panel stays in view while the task pane scrolls, avoiding long jumps to ask for help.
- Breadcrumbs remain above the workspace. Related exercises move below the primary work area so they do not compete with task completion.

### Exercise types

Essay/conversation exercises use the complete workspace immediately. Code, artifact, audio, and video exercises retain their specialized work surfaces and existing flows; their page-level spacing and related-content placement are brought into the same hierarchy without moving critical controls into an incompatible generic shell.

## Component boundaries

Create a client-side `ExerciseWorkspace` composition component responsible only for responsive layout and active mobile tab state. It receives:

- a `task` slot for the existing exercise-specific surface;
- an `aiChat` slot containing the existing `ExerciseChat` instance;
- optional supporting content for post-completion recommendations.

`ExerciseChat` remains the source of truth for messages, streaming state, completion tool events, restart behavior, and its composer. It gains only the sizing hooks needed for the workspace's mobile and desktop contexts; it does not own page navigation or task content.

The server exercise page continues to load data and chooses the correct exercise renderer. It assembles the workspace for compatible exercise types and passes existing props unchanged.

## Layout and visual hierarchy

Use the established Tailwind spacing scale: 8–12 px within headers and controls, 16–24 px within a pane, and 24–40 px between page-level groups. The task title and instructions appear before supporting metadata. The AI panel is visually distinct through the existing muted/primary-tinted surfaces, not new gradients or nested cards.

On mobile, the tab bar is directly beneath the exercise context and remains available while switching views. On desktop, a grid establishes the two columns and avoids nested cards: the task surface is the primary canvas and the AI panel is the single supporting container.

## Accessibility and resilience

- Preserve semantic heading order and associate tab panels with their triggers via the existing tab component.
- Do not hide active task controls from keyboard users.
- Respect reduced-motion preferences; tab transitions are instantaneous or use the existing primitive behavior.
- Long instructions and AI responses wrap safely; the chat panel scrolls internally rather than expanding indefinitely.
- Empty chat, completed exercise, loading, restart, and keyboard-open states retain their existing feedback and are tested in both layouts.

## Verification

1. On a 375 px viewport, Task is selected initially; task content and AI chat switch without losing entered state.
2. On mobile, the chat composer remains usable above the iOS/Android virtual keyboard.
3. At desktop widths, task and AI chat appear side by side; the AI panel remains usable while reading a long task.
4. Existing exercise completion, restart, streaming, and suggestion behavior still works.
5. Code, artifact, audio, and video exercise flows still render their specialized UIs.
6. Run the scoped layout detector, lint, and production build. Manually check keyboard tab navigation, focus state, long localized text, and reduced motion.
